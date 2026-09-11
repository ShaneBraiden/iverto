# Load Test Results

**Companion to:** [`TEST-PLAN.md`](./TEST-PLAN.md) · [`RUNBOOK.md`](./RUNBOOK.md)
**Last updated:** 2026-09-09

---

## TL;DR

| | |
|---|---|
| **Can the backend's capacity be stated yet?** | **No.** The load scenarios have **not been run.** |
| **Why not** | Two hard blockers: (1) no test accounts exist, so every simulated user fails at `POST /auth/login`; (2) the target is production and the run is not authorised (no infra-owner sign-off, no off-peak window, source IP not allowlisted). See [§4](#4-blockers). |
| **What was done** | k6 installed, all 7 scenario scripts validated, and a minimal read-only connectivity + latency baseline captured against production. See [§2](#2-run-0--environment-validation--baseline) and [§3](#3-baseline-latency). |
| **Next step** | Provision the test-account pool ([§5](#5-what-is-needed-to-run-the-real-test)) and get the production run signed off ([`TEST-PLAN.md §10`](./TEST-PLAN.md#10-execution-checklist)) — or stand up a staging target and skip the sign-off. Then run the suite per [`RUNBOOK.md §4`](./RUNBOOK.md#4-the-test-suite). |

No load figures are reported here because none were produced. This file will be
updated with real numbers once the suite runs.

---

## 1. Environment

| | |
|---|---|
| Date | 2026-09-09 |
| Generator | Local workstation — Windows 11, `win32`. **Not** a cloud VM. |
| Tool | k6 `v2.2.0` (`commit 00a9a1b7f5`, `go1.26.5`, `windows/amd64`), installed via `winget install GrafanaLabs.k6` |
| Target | `https://api.iverto.ai/hostel` (**production**) — from `app.json → extra.apiUrl` |
| Node | `v24.13.0` (for the helper scripts) |

> The generator being a laptop is itself a problem for real runs — see
> [`RUNBOOK.md §6`](./RUNBOOK.md#6-run-it-from-a-cloud-vm-not-your-laptop). The
> baseline below already shows ~45 ms of network RTT that a co-located VM would not pay.

---

## 2. Run 0 — environment validation + baseline

### 2.1 k6 script validation

All scenario scripts compile and their scenario options resolve under k6 v2.2.0
(`k6 inspect <script>`), including the `k6/ws` Socket.IO handshake in `socket.js`.

| Script | `k6 inspect` | Notes |
|---|---|---|
| `smoke.js` | ✅ pass | `shared-iterations`, 3 VUs × 30 iters |
| `load.js` | ✅ pass | `constant-arrival-rate` 30/s, preAllocVUs 360 / maxVUs 900 |
| `stress.js` | ✅ pass | `ramping-arrival-rate` 10→600/s, catastrophic abort at `http_req_failed>0.25` |
| `spike.js` | ✅ pass | 8→300/s in 15 s, hold, recover |
| `soak.js` | ✅ pass | `constant-arrival-rate` 25/s, 2 h |
| `socket.js` | ✅ pass | `ramping-vus` 0→1000, engine.io v4 framing |
| `login-storm.js` | ✅ pass | `ramping-arrival-rate` 20→500/s |

The `verify-accounts.mjs` and `cleanup.mjs` helpers parse clean (`node --check`).

### 2.2 Connectivity probe

**Method:** 10 sequential `GET /hostel/v1/mobile/app-config`, 1 second apart,
unauthenticated (expecting `401`), plus 3 one-off checks. Total ~13 requests over
~30 s — **far below the traffic of a single person opening the app once.** This is a
health check, not a load test.

| Check | Result |
|---|---|
| Requests sent | 13 |
| HTTP `401` (expected — no bearer token) | 10 / 10 on the probed endpoint |
| HTTP `5xx` / connection errors / timeouts | **0** |
| Edge | `Via: 1.1 Caddy` header present — confirms the Caddy reverse proxy |
| Error envelope | `{"statusCode":401,"error":"UNAUTHORIZED","message":"Missing bearer token"}` — matches `lib/api/client.ts` expectations |
| Rate-limit headers | none advertised (`RateLimit-*`, `Retry-After` absent) — not proof there is no limiting |
| `GET /` (base host) | `404` — only prefixed paths are routed, as documented |
| `GET /hostel/socket.io/?EIO=4&transport=polling` | `200` — engine.io endpoint reachable, prefix `/hostel/socket.io` correct |

**Verdict:** production edge is healthy and reachable; routing, TLS, the Socket.IO
path, and the error contract are all as the client expects.

---

## 3. Baseline latency

From the probe above. This is the **floor** — an unauthenticated `401` does routing
and an auth-guard rejection only: no DB query, no business logic. Real endpoints will
be slower.

| Metric | Value | Comment |
|---|---:|---|
| First request (cold) | **821 ms** | DNS resolution 333 ms + full TLS handshake. One-off. |
| Steady-state total (req 2–10) | min **121** / median **126** / mean **136** / max **180 ms** | |
| TCP connect (≈ RTT) | median **45 ms** | Server is not near this workstation. A co-located load generator removes most of this. |
| TLS resume | ~50 ms on top of connect | |
| Server time for a `401` (TTFB − connect) | ~**60–115 ms** | Routing + guard only. Treat as the irreducible per-request overhead; authenticated reads sit on top. |

**Implication for a real run:** from this workstation, every simulated request would
carry ~45 ms RTT it would not carry from an in-region VM. Any capacity number
measured from here is pessimistic. Run the generator in the API's region
([`RUNBOOK.md §6`](./RUNBOOK.md#6-run-it-from-a-cloud-vm-not-your-laptop)).

---

## 4. Blockers

### Blocker 1 — no test accounts _(hard)_

`data/accounts.json` does not exist, and the API has no self-service signup
(`lib/api/endpoints.ts`: "accounts are provisioned by the hostel office"). Every
journey in every scenario begins with `POST /v1/mobile/auth/login`.

Running any scenario now would send **only failed logins** to the production auth
endpoint at rates from 20/s (`login-storm`) to hundreds/s (`stress`). That is
indistinguishable from a credential-stuffing attack: it would almost certainly trip
account/IP protection, get this IP blocked, and produce **zero** capacity data.

→ **Not run.** Needs a provisioned account pool ([§5](#5-what-is-needed-to-run-the-real-test)).

### Blocker 2 — production run not authorised _(hard)_

The target is `https://api.iverto.ai/hostel` — the live system a real hostel runs on.
`load.js` sustains ~200–350 req/s for 20 min; `stress.js` ramps to 600 req/s. Against
production that is a deliberate load event that can degrade the app for real students,
parents and wardens while it runs, and can trip edge protection.

[`TEST-PLAN.md §10`](./TEST-PLAN.md#10-execution-checklist) requires, before any
production run: infra-owner approval, ops/on-call awareness, an off-peak window, the
generator's source IP allowlisted at the edge, and a named person watching server
dashboards with authority to stop it. None of that is in place, and there is no
evidence it has been arranged.

→ **Not run.** Either complete the sign-off checklist, or point the suite at a
dedicated staging/dev backend (`-e API_PREFIX=/devhostel` or a separate host) with a
seeded database, where these constraints do not apply.

### Not a blocker, but note

- Generator is a laptop, not an in-region VM (see [§3](#3-baseline-latency)).
- k6 v2.2.0 is newer than the scripts were written against; all scripts validated OK,
  but a `smoke.js` run against a real account pool is still the required first step.

---

## 5. What is needed to run the real test

### 5.1 Test-account pool

Ask whoever provisions accounts (hostel office / backend team) for a block of
**dedicated test accounts**, ideally on a separate test **site/tenant**. Deliver as
`data/accounts.json` (git-ignored; template at `data/accounts.example.json`):

```json
[
  { "identifier": "<roll-no>",  "password": "<pw>", "role": "student" },
  { "identifier": "<mobile>",   "password": "<pw>", "role": "parent"  },
  { "identifier": "<email>",    "password": "<pw>", "role": "warden"  },
  { "identifier": "<email>",    "password": "<pw>", "role": "admin"   }
]
```

| Role | For `smoke` + `load` (30/s) | For `stress` (→600/s) & `socket` (→1000) |
|---|---:|---:|
| student | ~300 | ~1,500 (or accept reuse + expect `429`s) |
| parent | ~60 | ~250 |
| warden | ~12 | ~30 |
| admin | ~4 | ~5 |

Fewer works — accounts just get shared across VUs, which invites the API's
per-account throttles (decisions 1/5 s). One account per concurrent VU is the clean case.

**Write-ring** (only if running `WRITE_MODE=light`/`full`): a handful of extra
**throwaway dummy** student/parent accounts flagged `"write": true`. Never real
students — a write-ring `submit` creates a real outpass and pushes their real warden.

### 5.2 Target decision

| Option | Action |
|---|---|
| **Staging / dev** *(recommended)* | Get a backend deployment with its own DB seeded with the test accounts. Run with `-e BASE_URL=... -e API_PREFIX=/devhostel` (or the staging host). No sign-off section needed; `WRITE_MODE` can go to `full`. |
| **Production, reads only** | Complete [`TEST-PLAN.md §10`](./TEST-PLAN.md#10-execution-checklist) sign-off. Keep `WRITE_MODE=off`. Off-peak window. IP allowlisted. Watcher on dashboards. |
| **Production, with writes** | All of the above **plus** a dedicated test site/tenant and the write-ring. Higher risk; document the cleanup owner. |

### 5.3 Then

Per [`RUNBOOK.md §3–4`](./RUNBOOK.md#3-one-time-setup):

```bash
cd load-test
# set BASE_URL / API_PREFIX / ACCOUNTS_FILE env vars
node scripts/verify-accounts.mjs              # every account must log in
k6 run k6/smoke.js                            # must pass before anything else
k6 run --summary-export results/load-summary.json k6/load.js
k6 run --summary-export results/stress-summary.json --out json=results/stress-raw.json k6/stress.js
# ...spike, socket, login-storm, soak
```

Ideally from a cloud VM in the API's region.

---

## 6. Results — to be filled in after the run

_(copied from [`TEST-PLAN.md §11`](./TEST-PLAN.md#11-results-fill-in) — populate when the suite runs)_

**Run:** _date / time / window_
**Target:** _._ · **Generator:** _VM type, region_ · **k6:** v2.2.0 · **API build:** _commit_
**WRITE_MODE:** _._ · **Account pool:** _n students / n parents / …_

### Per-scenario outcome

| Scenario | Result | read p95 | read p99 | error rate | notes |
|---|---|---|---|---|---|
| smoke | | | | | |
| load (30/s) | PASS / FAIL | | | | |
| stress | knee at ___ req/s | | | | first limiter: ___ |
| spike | | | | | recovery time: ___ |
| soak (2 h) | | drift: ___ | | | mem start/end: ___ |
| socket | ___ conns at <5% fail | connect p95: ___ | | | |
| login-storm | login p95 at 500/s: ___ | | | | CPU saturates at ___/s |

### Capacity statement

- Sustained knee: **___ req/s** / **___ concurrent VUs** / **___ concurrent sockets**
- Headroom over modelled peak (~35 req/s sustained, ~300 sockets): **___×**
- Estimated supportable concurrent active users: **___**
- First bottleneck: **___** (evidence: ___)
- Second: **___**

### Recommendations

1.
2.
3.

---

## Appendix — raw probe output

```
GET https://api.iverto.ai/hostel/v1/mobile/app-config   (10×, 1s apart, no auth)

req  1: http=401 dns=0.333s connect=0.365s tls=0.789s ttfb=0.821s total=0.821s   (cold)
req  2: http=401 dns=0.015s connect=0.048s tls=0.111s ttfb=0.142s total=0.142s
req  3: http=401 dns=0.027s connect=0.058s tls=0.111s ttfb=0.143s total=0.143s
req  4: http=401 dns=0.010s connect=0.040s tls=0.093s ttfb=0.125s total=0.126s
req  5: http=401 dns=0.012s connect=0.039s tls=0.094s ttfb=0.122s total=0.123s
req  6: http=401 dns=0.011s connect=0.041s tls=0.094s ttfb=0.123s total=0.123s
req  7: http=401 dns=0.016s connect=0.049s tls=0.098s ttfb=0.126s total=0.126s
req  8: http=401 dns=0.009s connect=0.046s tls=0.102s ttfb=0.180s total=0.180s
req  9: http=401 dns=0.017s connect=0.045s tls=0.091s ttfb=0.121s total=0.121s
req 10: http=401 dns=0.011s connect=0.064s tls=0.113s ttfb=0.143s total=0.143s

GET https://api.iverto.ai/                                    -> 404 (unrouted, expected)
GET https://api.iverto.ai/hostel/socket.io/?EIO=4&transport=polling -> 200, ttfb 0.156s
Response headers: Date, Via: 1.1 Caddy   (no Server, no RateLimit-* )
Body (401): {"statusCode":401,"error":"UNAUTHORIZED","message":"Missing bearer token"}
```
