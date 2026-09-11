# Load Test Runbook

How to actually run the suite. The *why* — workload model, SLOs, risk analysis —
is in [`TEST-PLAN.md`](./TEST-PLAN.md). Read §9 (risks) of that before pointing
anything at production.

- [1. What this does](#1-what-this-does)
- [2. Prerequisites](#2-prerequisites)
- [3. One-time setup](#3-one-time-setup)
- [4. The test suite](#4-the-test-suite)
- [5. Reading the results](#5-reading-the-results)
- [6. Run it from a cloud VM, not your laptop](#6-run-it-from-a-cloud-vm-not-your-laptop)
- [7. Live dashboard (optional)](#7-live-dashboard-optional)
- [8. Production run protocol](#8-production-run-protocol)
- [9. Cleanup](#9-cleanup)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. What this does

Drives load at the **Iverto backend** (`api.iverto.ai/hostel/v1/mobile/**` and the
Socket.IO gateway) using [k6](https://k6.io), simulating students, guardians and
wardens using the app, to find the point where response times or error rates cross
the targets in `TEST-PLAN.md §6`.

It does **not** test the mobile app itself — that's a client, it has no capacity.

```
load-test/
├── RUNBOOK.md            ← you are here
├── TEST-PLAN.md          ← the plan / design doc
├── k6/
│   ├── smoke.js  load.js  stress.js  spike.js  soak.js  socket.js  login-storm.js
│   └── lib/              ← config, auth, per-role journeys (shared)
├── scripts/
│   ├── verify-accounts.mjs   ← pre-flight: log in every account
│   └── cleanup.mjs           ← cancel test-created outpasses
├── data/
│   └── accounts.example.json ← copy to accounts.json, fill in real credentials
├── observability/       ← optional Prometheus + Grafana for live charts
└── results/             ← run output lands here (git-ignored)
```

---

## 2. Prerequisites

### Install k6

| OS | Command |
|---|---|
| Windows | `winget install k6.k6` &nbsp;or&nbsp; `choco install k6` |
| macOS | `brew install k6` |
| Linux | see <https://grafana.com/docs/k6/latest/set-up/install-k6/> |

Verify: `k6 version` (need v0.50+; `k6/ws` and the ramping executors used here are older than that, so anything current is fine).

### Node

Node 18+ for the helper scripts (`verify-accounts.mjs`, `cleanup.mjs`). This repo
already uses Node — `node --version`.

### Test accounts

You need real, pre-provisioned accounts (the API has no self-signup). Sizing:

| Run | Minimum distinct accounts (to avoid sharing) |
|---|---|
| `smoke.js` | ~5 (any mix) |
| `load.js` at 30/s | ~300 students, ~60 parents, ~12 wardens, ~4 admins |
| `stress.js` to 600/s | as many as you can get; past the pool size accounts get reused and you'll see `429`s from the API's per-account throttles |
| `socket.js` to 1,000 | ~1,000 (any role) — or accept reuse; a socket per account is cleanest |

Ask the hostel office / backend team to bulk-provision a block of test accounts,
ideally on a dedicated test **site/tenant**. For any `WRITE_MODE` other than `off`
you also need a small **write-ring** of throwaway dummy accounts (see §8).

### Authorisation

Load-testing production is a change with blast radius. Before a production run you
need the sign-off checklist in `TEST-PLAN.md §10` completed — infra owner approval,
an off-peak window, ops awareness, and the source IP allowlisted at the edge.

---

## 3. One-time setup

```bash
cd load-test

# 1. Account pool
cp data/accounts.example.json data/accounts.json
#    edit data/accounts.json — real identifiers + passwords, one object per account
#    (accounts.json is git-ignored)

# 2. Point at the target. k6 reads real OS env vars into __ENV, so either export
#    them or pass -e on each run. There is NO automatic .env loading.
```

**PowerShell (Windows):**

```powershell
$env:BASE_URL   = "https://api.iverto.ai"
$env:API_PREFIX = "/hostel"      # "/devhostel" for the dev deployment, "" for local
$env:WS_PREFIX  = "/hostel"
$env:ACCOUNTS_FILE = "$PWD\data\accounts.json"
```

**bash:**

```bash
export BASE_URL=https://api.iverto.ai API_PREFIX=/hostel WS_PREFIX=/hostel
export ACCOUNTS_FILE="$PWD/data/accounts.json"
```

```bash
# 3. Pre-flight — logs in every account, calls /me, writes data/tokens.json
node scripts/verify-accounts.mjs
#    fix any FAIL lines before continuing

# 4. Smoke test — proves the script + pool + thresholds
k6 run k6/smoke.js
#    expect: checks 100%, journey_errors 0, "thresholds ... ok"
```

> `ACCOUNTS_FILE`, if relative, is resolved against `k6/lib/` (k6 quirk — `open()`
> is relative to the calling module). Use an absolute path to avoid surprises.

---

## 4. The test suite

Run in this order. Each writes a summary JSON to `results/`. Full profiles and pass
criteria: `TEST-PLAN.md §5`.

```bash
# Expected busy-hour peak — MUST pass. ~20 min.
k6 run --summary-export results/load-summary.json k6/load.js

#   ...in a second terminal, run the socket load alongside it:
k6 run --summary-export results/socket-during-load.json k6/socket.js

# Find the ceiling. Ramps 8 -> 600 journeys/s. ~25 min. Watch server dashboards.
k6 run --summary-export results/stress-summary.json --out json=results/stress-raw.json k6/stress.js

# Broadcast-push burst + recovery. ~9 min.
k6 run --summary-export results/spike-summary.json k6/spike.js

# Socket gateway capacity, standalone. Ramps to 1,000 connections. ~21 min.
k6 run --summary-export results/socket-summary.json k6/socket.js

# Auth CPU. Ramps 20 -> 500 logins/s. ~7.5 min.
k6 run --summary-export results/login-storm-summary.json k6/login-storm.js

# Endurance. 2 h. Run overnight with socket.js (WS_HOLD_MS=600000) alongside.
k6 run --summary-export results/soak-summary.json --out json=results/soak-raw.json k6/soak.js
```

Or via npm (`package.json`), with env already exported: `npm run load`, `npm run stress`, …

### Knobs

| Env var | Default | Effect |
|---|---|---|
| `BASE_URL` | `https://api.iverto.ai` | target origin |
| `API_PREFIX` / `WS_PREFIX` | `/hostel` | deployment prefix |
| `ACCOUNTS_FILE` | `../../data/accounts.json` | account pool path |
| `RATE` | 30 (`load`), 25 (`soak`) | journeys/second |
| `DURATION` | `20m` / `2h` | run length |
| `PEAK` | 600 (`stress`), 1000 (`socket`), 500 (`login-storm`) | top of the ramp |
| `SPIKE` | 300 | journeys/s at spike apex |
| `WS_HOLD_MS` | 180000 | how long each socket stays open |
| `ROLE_MIX` | `student:80,parent:15,warden:4,admin:1` | traffic composition |
| `WRITE_MODE` | `off` | `off` \| `light` \| `full` — see §8 |
| `LOCATION_PINGS` | `off` | `on` adds `POST /location/ping` to student journeys |

Example — gentler stress ramp against the dev deployment:

```bash
k6 run -e BASE_URL=https://api.iverto.ai -e API_PREFIX=/devhostel -e PEAK=300 \
       --summary-export results/stress-dev.json k6/stress.js
```

---

## 5. Reading the results

At the end of every run k6 prints a summary. The parts that matter:

```
     ✓ GET /permissions/summary -> 2xx      ← checks: want > 99%
     http_req_duration..............: avg=... p(95)=...  ← the SLO
     { kind:read }..................: p(95)=180ms  p(99)=420ms
     { kind:write }.................: p(95)=...
     http_req_failed................: 0.42%      ← want < 1%
     iterations....................: 36000  30.0/s
     dropped_iterations............: 0          ← if > 0, YOUR generator is maxed, not the server
     vus / vus_max.................: 240 / 900

   THRESHOLDS
     http_req_failed
       ✓ 'rate<0.01'
     http_req_duration{kind:read}
       ✗ 'p(95)<800'  p(95)=1240ms      ← this run FAILED
```

- **`✓ thresholds ... ok`** and exit code 0 → the target held at that load.
- **`✗`** on a threshold → that's the answer for `stress.js`: note the request rate
  at the point it went red (from the live output or the Grafana chart).
- **`dropped_iterations > 0`** → k6 couldn't launch journeys fast enough. The
  *generator* is the bottleneck, not the server. Move to a bigger VM (§6) and re-run;
  the result so far is a lower bound only.
- **The knee** = the `stress.js` stage where read p95 first crosses 800 ms or errors
  cross 1%. Cross-reference `results/stress-raw.json` timestamps with the server's CPU
  / DB / memory graphs to name the bottleneck.

Convert the knee to a user count with the formula in `TEST-PLAN.md §6`, and record
everything in `TEST-PLAN.md §11`.

---

## 6. Run it from a cloud VM, not your laptop

A load test from a laptop on wifi measures **your uplink and CPU**, not the server.
You'll hit a false ceiling far below the real one.

- Spin up a VM **in the same region as `api.iverto.ai`** (check with `nslookup` /
  hosting provider; if it's on a major cloud, match the region).
- Size: `stress.js` to 600 journeys/s needs roughly **4–8 vCPU / 8–16 GB**. k6 is
  efficient (~a few thousand VUs per core) but the arrival-rate executors pre-allocate
  VUs. Start with 8 vCPU.
- `ulimit -n 100000` before `socket.js` (each socket is a file descriptor).
- Copy `load-test/` to the VM (or `git clone` and `cd load-test`), install k6, set
  env vars, run. Pull `results/` back with `scp`.
- Confirm the VM itself isn't saturated during the run: `dropped_iterations` should
  stay 0 and the VM's own CPU should have headroom.

For very large runs, k6 can distribute across machines (Grafana Cloud k6, or
`k6-operator` on Kubernetes) — overkill for 500–2,000 users; a single decent VM
covers the whole plan.

---

## 7. Live dashboard (optional)

The text summary + `--summary-export` are enough. If you want to *watch* latency and
throughput move during a run:

```bash
docker compose -f observability/docker-compose.yml up -d

k6 run -o experimental-prometheus-rw \
       -e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
       -e K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),avg,max" \
       k6/stress.js
```

Grafana at <http://localhost:3001> (anonymous admin). Add a Prometheus data source
`http://prometheus:9090`, then import dashboard **19665** from grafana.com.

Stop it: `docker compose -f observability/docker-compose.yml down`.

---

## 8. Production run protocol

You've chosen a **production, full test**. The safe default is a dedicated
staging/dev backend with a seeded DB — if you can get one, use `API_PREFIX=/devhostel`
or a staging host and skip most of this section. Against production:

### Write safety

`WRITE_MODE` defaults to `off` — **GET traffic plus login/refresh only**. This is
safe to run against production (it's just reads) and still answers the capacity
question, because production traffic is ~90% reads anyway.

To include writes:

| Mode | What it adds | Requirement |
|---|---|---|
| `off` | nothing | — |
| `light` | write-ring students `POST /permissions/submit` then immediately `/cancel`. Self-cleaning. Tagged with `RUN_TAG`. | A few dummy student accounts flagged `"write": true`. **Not real students** — the submit fires a real push to their warden. |
| `full` | write-ring parents/wardens also send `decision` calls | A dedicated test site/tenant with linked dummy student+parent accounts. Do not run against the real tenant. |

```bash
# example: reads + a trickle of self-cleaning submits, tagged for cleanup
$env:WRITE_MODE = "light"
$env:RUN_TAG    = "loadtest-2026-09-07T02-30"
k6 run --summary-export results/load-writes.json k6/load.js
```

Never enable: emergencies, announcements, uploads, forgot-password, logout, password
change, role change, profile-request approval, admin override. None are in the
scripts — keep it that way (`TEST-PLAN.md §3`).

### Window & watch

- **Off-peak.** Not the 21:00–22:00 pre-curfew rush. Something like 02:00–05:00 local.
- Ops/on-call **know the exact start and stop time**.
- Someone watches server CPU / memory / DB connections / Caddy 5xx / socket count for
  the whole run, with authority to tell you to stop.
- Agree the kill criteria up front (e.g. "real-user error rate > 2% for 60 s").

### Kill switch

`Ctrl-C` in the k6 terminal — stops launching new journeys immediately, lets in-flight
requests drain. `stress.js` also self-aborts if `http_req_failed` exceeds 25% for 30 s.

---

## 9. Cleanup

**Reads-only run (`WRITE_MODE=off`):** nothing to clean. Access tokens expire in 1 h.

**`WRITE_MODE=light` or `full`:**

```bash
# dry run first — shows what it would cancel, changes nothing
RUN_TAG=loadtest-2026-09-07T02-30 node scripts/cleanup.mjs --dry-run

# then for real
RUN_TAG=loadtest-2026-09-07T02-30 node scripts/cleanup.mjs
```

It logs in as each write-ring student, finds passes whose `reason` contains the tag,
and cancels the ones still in a cancellable state.

**Cannot be undone by the script** (so keep `full` on a test tenant only):
- decisions already recorded
- late-entry rows
- `POST /location/ping` rows (if `LOCATION_PINGS=on`) — ask the backend team to purge
  by timestamp + the pinger's student IDs

Also: delete `data/tokens.json` when done (it holds live-ish access tokens for ~1 h).

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `open ... no such file` on start | `ACCOUNTS_FILE` path. Use an absolute path; relative resolves against `k6/lib/`. |
| Every login fails in `verify-accounts.mjs` | Wrong `BASE_URL`/`API_PREFIX`, or the identifiers/passwords are wrong, or the accounts aren't provisioned. Try one by hand with `curl`. |
| `login returned accessToken` check fails but status is 200 | Response shape differs from `types/index.ts` `Session`. Check the backend actually returns `accessToken` at the top level. |
| Wall of `429 TOO_MANY_REQUESTS` | Accounts are being shared across too many VUs and hitting per-account throttles (decisions 1/5 s), **or** an edge per-IP rate limit. Seed more accounts; get the source IP allowlisted. |
| Wall of `403` mid-run | WAF / bot protection tripped on the traffic pattern. Coordinate with whoever runs Caddy. |
| `dropped_iterations` climbing | Generator saturated. Bigger VM, or lower `RATE`/`PEAK`. Results are a lower bound until this is 0. |
| Socket run: `ws_connect_fail` ~100% | Wrong `WS_PREFIX`, or the gateway isn't on `/socket.io`, or namespace isn't `/mobile`. Check `lib/live.ts` against the deployed backend. Also `ulimit -n`. |
| Socket run: connects then all drop after ~20–30 s | PONG not being sent — the server's `pingTimeout` fired. `k6/socket.js` replies `3` to `2`; if the server uses a non-default engine.io ping scheme, adjust. |
| `context deadline exceeded` / lots of `TIMEOUT` | Server is past its knee (that may be the finding), or the network path is bad, or the VM NIC is saturated. |
| Numbers look far worse than expected | Are you running from a laptop? (§6) Is something else hammering the same backend? Is `LOCATION_PINGS` or `WRITE_MODE` on by accident? |
| k6 exits non-zero but the run "looked fine" | A threshold was breached — that's by design. Check the `THRESHOLDS` block at the bottom of the summary. |

If a browser/API call fails 2–3 times the same way, stop and check the target config
with a single `curl` before burning another run.
