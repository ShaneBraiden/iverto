# Iverto Outpass — Load & Stress Test Plan

**Status:** draft — needs sign-off before any run against production (§9)
**Owner:** _(you)_
**Last updated:** 2026-09-07
**Companion:** [`RUNBOOK.md`](./RUNBOOK.md) — the step-by-step to actually run it

---

## 1. Purpose

Answer one question with evidence:

> **How many concurrent users can the Iverto backend serve before it stops meeting
> its response-time and error-rate targets — and what breaks first when it does?**

Secondary outcomes:

- A repeatable suite we can re-run after infra or code changes to catch regressions.
- A known-good "expected peak" profile that must always pass (a release gate, if wanted).
- A ranked list of the first bottlenecks (CPU, DB connections, socket memory, rate limiter…).

This is **not** a test of the mobile app. An Expo/React Native client runs one
instance per device; it has no "capacity". Everything here targets the backend the
app talks to.

---

## 2. System under test

Reconstructed from the client (`lib/api/client.ts`, `lib/api/endpoints.ts`,
`lib/live.ts`, `lib/session.ts`). Fill in the gaps from the backend team before the run.

| Layer | What we know | To confirm |
|---|---|---|
| Edge | Caddy reverse proxy. Routes `/hostel` → this service with the prefix intact (`/devhostel` on the dev deployment). | TLS termination, per-IP rate limits, request/idle timeouts, body-size caps |
| API | NestJS. All mobile routes under `https://api.iverto.ai/hostel/v1/mobile/**`. Error envelope `{ statusCode, error, message[] }`. Documented throttles: decisions 1/5 s, emergencies 1/30 s, generic `429 TOO_MANY_REQUESTS`. | Instance count / autoscaling, CPU & memory per instance, framework-level global rate limit |
| Realtime | Socket.IO gateway. Namespace `/mobile`, engine.io v4 handshake path `/hostel/socket.io`, **websocket transport only**, JWT passed in the CONNECT payload (`auth: { token }`). One socket per foregrounded app. | Max connections per instance, sticky-session / adapter (Redis?) for multi-instance, ping/timeout config |
| Auth | Password-only login → JWT access token, `expiresIn: 3600` (1 h), plus refresh token. `POST /v1/mobile/auth/refresh` trades refresh for a new access token. Token looks like a Supabase JWT. | KDF cost (bcrypt/argon2 params), account lockout policy, refresh-token rotation |
| Data | Postgres (Supabase implied). | Plan/tier, connection-pool size, pgBouncer?, read replicas |
| Push | FCM (`google-services.json`, `expo-notifications`). Announcements and emergencies fan out to every recipient. | Rate limits / cost per push, provider throttling |
| Object storage | `POST /v1/mobile/uploads`, 5 MB cap, 5-minute signed read URLs. | Bucket, egress cost — **out of scope for load, see §3** |

Unknowns above are exactly the things a stress test tends to expose, so note them and
watch their dashboards during the run.

---

## 3. Scope

### In scope

- **All read endpoints** the app calls on a normal session (the "app open" fan-out
  plus each role's dashboard and drill-downs). Full inventory in [Appendix A](#appendix-a--endpoint-inventory).
- **`POST /auth/login` and `/auth/refresh`** — unavoidable, and a load pattern in
  their own right (`login-storm.js`).
- **Socket.IO connection load** — concurrent live connections and handshake latency
  (`socket.js`).
- **Optionally**, a low rate of self-cleaning writes: `POST /permissions/submit`
  immediately followed by `/cancel`, from a dedicated write-ring (`WRITE_MODE=light`).

### Out of scope — do not add these to any journey

| Endpoint | Why it's excluded |
|---|---|
| `POST /parent/emergencies` | Pushes **every warden of the site** immediately. Real people get paged. |
| `POST /admin/announcements` | Pushes **every recipient** in the audience. Mass real notifications. |
| `POST /uploads` | Real object-storage writes + egress cost + quota. Adds nothing to the capacity question. |
| `POST /auth/forgot-password` | Sends real email/SMS. |
| `POST /auth/logout` | Disables the push token for the account. |
| `POST /auth/password`, `PUT /admin/users/:id/role` | Mutate real accounts irreversibly. |
| `GET /admin/permissions/export`, `/admin/profile-requests/export` | Heavy CSV generation; run one or two by hand if you specifically want to measure export cost, never in a loop. |

### Write modes

| `WRITE_MODE` | Sends | Safe target |
|---|---|---|
| `off` *(default)* | GET + login/refresh only | production |
| `light` | above + write-ring students `submit` then `cancel` (self-cleaning, tagged) | production, with sign-off + cleanup |
| `full` | above + write-ring parent/warden `decision` calls | **dedicated test site/tenant only** |

`LOCATION_PINGS=on` adds `POST /location/ping` (writes a location row per student per
minute — a real and significant part of production write load) and is independent of
`WRITE_MODE`.

---

## 4. Workload model

### 4.1 Population (working figure: ~1,500 total, within the stated 500–2,000)

| Segment | Count | Basis |
|---|---:|---|
| Students | 1,200 | one mid-size hostel |
| Guardians (parent accounts) | 250 | less than 1 per student — shared numbers, non-adopters |
| Wardens | 12 | |
| Admin / office | 4 | |
| **Total** | **1,466** | |

Adjust the numbers, keep the method.

### 4.2 Role mix of live traffic

Students dominate; guardians arrive in bursts reacting to approval pushes; a handful
of wardens are on the queue continuously.

| Role | Share of journeys | k6 default (`ROLE_MIX`) |
|---|---:|---|
| student | 80% | `student:80` |
| parent | 15% | `parent:15` |
| warden | 4% | `warden:4` |
| admin | 1% | `admin:1` |

### 4.3 Per-role journey (what one "session" does)

Every journey opens with the **app-open fan-out** (from `components/AppContext.tsx`
and the root layout):

```
GET /me
GET /me/branding
GET /app-config
GET /notifications/unread-count
```

then:

| Role | Follow-on calls (probability) |
|---|---|
| **student** | `/permissions/summary`, `/curfew` (always); `/categories` (0.7); `/permissions?status=all&limit=20` (0.45) → `/permissions/:id` (0.5 of that); `/notifications?limit=20` (0.25); `/location/ping` if `LOCATION_PINGS=on` (≤1/min); `submit`+`cancel` if write-ring (0.3) |
| **parent** | `/parent/children`, `/parent/permissions?decided=false` (always); `/parent/permissions?decided=true&limit=20` (0.5); `/parent/permissions/:id` (0.6 if a pending item exists); `/parent/children/:id` (0.3) → `/parent/children/:id/location` (0.4 of that); `decision` if write-ring + `full` |
| **warden** | `/warden/dashboard`, `/warden/permissions`, `/admin/stats` (always); `/admin/activity?limit=20` (0.6); `/admin/emergencies?status=open` (0.5); `/admin/permissions/:id` (0.5); `decision` if write-ring + `full` |
| **admin** | `/admin/stats`, `/admin/activity`, `/warden/permissions` (always); `/admin/roster` (0.5); `/admin/groups` (0.4); `/admin/profile-requests` (0.4); `/admin/announcements?limit=10` (0.3, read only); `/admin/emergencies` (0.4) |

Think time between "screens": uniform 0.4–1.6 s. A student session is ~8–14 requests
over ~4–8 s of wall time; the socket it opens (modelled separately in `socket.js`)
would stay up for the 3–6 min the app is foregrounded.

### 4.4 Peak estimate (pre-curfew rush, ~21:00–22:00)

| Contribution | Estimate |
|---|---|
| Students opening the app | 55% of 1,200 open ≥1×, ×2.2 sessions ≈ 1,450 sessions/h; peak minute ≈ 3× average ≈ **1.2 sessions/s** |
| Guardian sessions | push-driven, ~135/h, bursty right after submissions ≈ **0.1 sessions/s** avg |
| Warden/admin | ~10 persistent sessions, refetch every 1–2 min |
| **New journeys/s at peak** | **≈ 1.3 – 1.5 / s** |
| **HTTP req/s** | ~20–35/s sustained; **~90/s burst** when a reminder push lands |
| **Concurrent Socket.IO connections** | **≈ 250 – 400** |
| **Concurrent in-flight VUs** | ≈ 120 – 250 |
| **Logins/s** | ~1.5/s; **~40/s** first-open-of-the-day burst |

### 4.5 Test targets (≈4× headroom over expected peak)

| Dimension | Expected peak | `load.js` runs at | "Pass" means SLOs hold at |
|---|---:|---:|---:|
| New journeys/s | ~1.5 | **30** | ≥ 30 |
| HTTP req/s | ~90 burst | ~200–350 | ≥ 120 sustained |
| Socket connections | ~400 | ramp to **1,000** | ≥ 1,000 |
| Logins/s | ~40 burst | ramp to **500** | ≥ 200 |

`stress.js` then pushes past that to find the actual ceiling.

---

## 5. Test scenarios

| Script | Type | Profile | Duration | Pass criteria |
|---|---|---|---|---|
| `smoke.js` | validation | 3 VUs, 30 iterations | ~2 min | script runs, pool authenticates, 0 `journey_errors`, thresholds evaluated |
| `load.js` | **expected peak** | 30 journeys/s, constant arrival | 20 min | **all SLOs in §6 green** |
| `stress.js` | capacity / knee | ramp 8→600 journeys/s in 8 steps | ~25 min | identify the rate where read p95 crosses 800 ms and/or errors > 1%; server recovers to baseline within 5 min of ramp-down |
| `spike.js` | burst (broadcast push) | 8/s baseline → 300/s in 15 s → hold 3 min → back to 8/s | ~9 min | no error spike > 5%; **latency returns to baseline within 3 min** of the drop |
| `soak.js` | endurance | 25 journeys/s | 2 h | no upward drift in latency or server memory; token refresh at the 1 h mark is transparent; 0 `journey_errors` |
| `socket.js` | gateway capacity | ramp 0 → 1,000 concurrent connections, hold 10 min | ~21 min | `ws_connect_fail` < 5% and `ws_connect_time` p95 < 3 s at 1,000 |
| `login-storm.js` | auth CPU | ramp 20 → 500 logins/s | ~7.5 min | login p95 < 2 s; record the rate at which API CPU saturates |

Run `load.js` / `soak.js` **with `socket.js` in a second terminal** so the gateway is
carrying its share of connections at the same time (that's what production looks like).

---

## 6. Metrics & SLOs

These are encoded as k6 thresholds in `k6/lib/config.js` (`THRESHOLDS`). A run that
breaches any of them **fails** (non-zero k6 exit code).

| Metric | Threshold | Rationale |
|---|---|---|
| `http_req_failed` | rate < **1%** | Users retry a one-off; sustained > 1% is visible breakage. |
| `checks` | rate > **99%** | The response body is actually usable, not just a 200. |
| `http_req_duration{kind:read}` | p95 < **800 ms**, p99 < **2 s** | The app shows skeleton loaders; past ~800 ms feels sluggish, past ~2 s feels broken. Client hard-aborts at 30 s (`TIMEOUT_MS`). |
| `http_req_duration{kind:write}` | p95 < **1.5 s**, p99 < **4 s** | One-tap submit/approve with a spinner; users tolerate a bit more, not much. |
| `http_req_duration{kind:auth}` | p95 < **1.5 s**, p99 < **3 s** | Password KDF is deliberately slow; must still feel like "signing in", not "hung". |
| `login_failures` | count **0** | A correct credential must never be rejected under load. |
| `journey_errors` | count **0** | Any non-2xx on a modelled step. |
| `ws_connect_fail` | rate < **5%** | The socket degrades gracefully to focus-refetch, but > 5% means the live layer is effectively down. |
| `ws_connect_time` | p95 < **3 s** | Should feel instant after login. |

**Capacity limit ("the knee")** is defined as the lowest sustained request rate in
`stress.js` at which *either* `http_req_duration{kind:read}` p95 ≥ 800 ms *or*
`http_req_failed` ≥ 1%, held for 30 s+.

**Translating the knee into users:**

```
supportable concurrent active users  ≈  current peak active users  ×  ( knee req/s  /  current peak req/s )

headroom factor                      =  knee req/s  /  expected peak req/s
```

Example: if `stress.js` holds SLOs up to **250 req/s** and the modelled peak is
**~35 req/s sustained** for ~300 concurrent users, headroom ≈ **7×**, i.e. the backend
should serve on the order of **~2,000 concurrent active users / ~10,000 registered**
before SLO violation — comfortably above the current 500–2,000. Replace with real
numbers after the run.

---

## 7. Environment & tooling

| | |
|---|---|
| **Tool** | [k6](https://k6.io) (Grafana). JS-scripted, single Go binary, first-class ramping executors, thresholds as pass/fail SLOs, runs on Windows. |
| **Socket.IO** | Handled in k6 via `k6/ws` with a hand-rolled engine.io-v4 handshake (`k6/socket.js`) so each virtual user gets its own JWT — matching `lib/live.ts`. (Artillery's `socketio` engine is the usual alternative but makes per-VU auth awkward; noted, not used.) |
| **Load generator host** | **A cloud VM in the same region as `api.iverto.ai`.** A laptop on home/office wifi will bottleneck on its own uplink and CPU well before the server does, producing a wrong (pessimistic) answer. See RUNBOOK §6 for sizing. |
| **Observability — load side** | k6 end-of-test summary + `--summary-export` JSON (always). Optional live Grafana via `observability/docker-compose.yml` (Prometheus remote-write). |
| **Observability — server side** | *Required.* Someone watching CPU, memory, event-loop lag, DB connections/slow queries, Caddy 4xx/5xx, socket count, for every run. The k6 numbers say *what* broke; the server dashboards say *why*. |
| **Version pinning** | Record `k6 version`, API build/commit, and DB tier in each result set. |

---

## 8. Test data

| Need | Detail |
|---|---|
| **Read accounts** | Pre-provisioned (no self-signup). Aim for **≥ 1 distinct account per concurrent VU** so no account is shared: ~400 students, ~80 parents, ~15 wardens, ~5 admins covers `load.js`; scale up for `stress.js` (or accept account reuse and watch for `429`). |
| **Account file** | `data/accounts.json` — array of `{ identifier, password, role, tenantId?, write? }`. Template: `data/accounts.example.json`. Git-ignored. |
| **Write-ring** | Accounts flagged `"write": true`. Must be **dummy accounts created for testing**, never real students/guardians — a write-ring student's `submit` is a real DB row and a real push to whoever their warden is. Ideally on a dedicated test site/tenant. |
| **Markers** | Every created record carries `RUN_TAG` (default `loadtest-<UTC-timestamp>`) in `reason` / `note`. `scripts/cleanup.mjs` finds and cancels them afterwards. |
| **Pre-flight** | `node scripts/verify-accounts.mjs` logs in every account and calls `/me`; fix failures before the run. |

---

## 9. Risks & mitigations — production run

The chosen target is **production, full test**. The recommended target is a dedicated
staging/dev deployment with a seeded database; if that can be stood up, most of this
table disappears. Assuming production:

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Real users get a slow/broken app during the run | High if on-peak | High | **Off-peak window** (e.g. 02:00–05:00 local). Announce to ops. `stress.js` has a catastrophic-abort guard (`http_req_failed > 25%`). A named person watches dashboards with authority to kill the run. | |
| 2 | Fake outpasses pollute production data | High if `WRITE_MODE≠off` | Medium | Default `off`. Write-ring = dummy accounts only. `RUN_TAG` marker + `cleanup.mjs`. Verify cleanup with `--dry-run` first. | |
| 3 | Real push notifications to real people | High if writes on real accounts | High | No `submit`/`decision` touches a real account. Emergencies & announcements are not in any journey and must not be added. | |
| 4 | Warden paged by a fake emergency | Only if misconfigured | Severe | `raiseEmergency` / `announce` absent from all scripts by design. Review any journey change against §3. | |
| 5 | Edge rate limiter / WAF blocks the generator IP mid-run | Medium | Medium — invalidates results | Coordinate allowlisting the source IP with whoever runs Caddy. Watch for a sudden wall of `429`/`403`. Ramp gradually. | |
| 6 | Account lockout from reused credentials in `login-storm.js` | Medium | Medium | Confirm the server's lockout policy first. Seed the widest possible account set. | |
| 7 | The generator (laptop/uplink) is the bottleneck → falsely low ceiling | High from a laptop | High | Run from a cloud VM in-region; confirm VM CPU and NIC have headroom (`k6` reports `dropped_iterations` if it can't keep up). | |
| 8 | Token expiry mid-`soak` breaks the run | Medium | Low | Refresh path implemented in `k6/lib/http.js`; `soak.js` is partly a test of it. | |
| 9 | Cost — egress, FCM, any triggered SMS/email | Low–Med | Low–Med | Reads only; no uploads; no forgot-password. Estimate egress for the planned request volume. | |
| 10 | Shared infra — other services behind the same DB/host degrade | Medium | Medium–High | Check what else is on that host/DB (Caddy routes "several services"). Get their owners' awareness. | |

**Kill switch:** `Ctrl-C` in the k6 terminal stops new iterations immediately;
in-flight requests finish or time out. Have the server team ready to shed load at the
edge if needed.

---

## 10. Execution checklist

### Sign-off (before any production run)

- [ ] Backend/infra owner has approved this plan and the window
- [ ] Ops/on-call is aware of the exact start/end time
- [ ] Source IP allowlisted at the edge (or confirmed not rate-limited)
- [ ] `WRITE_MODE` decided and written down; if not `off`, write-ring verified as dummy accounts
- [ ] Server dashboards open; named watcher assigned; kill criteria agreed
- [ ] Rollback/cleanup owner assigned

### Pre-flight (each run)

- [ ] Generator is a cloud VM in-region, not a laptop
- [ ] `k6 version` and API build recorded
- [ ] `node scripts/verify-accounts.mjs` passes
- [ ] `k6 run k6/smoke.js` passes
- [ ] Baseline captured: run `load.js` at `RATE=3` for 3 min, record idle-ish latency

### During

- [ ] Watch `dropped_iterations` (generator saturated) and `429`/`403` (edge throttling)
- [ ] Note the request rate at each `stress.js` stage and what the server dashboards show
- [ ] Screenshot / export server metrics at the knee

### After

- [ ] `--summary-export` JSON saved under `results/` with a dated name
- [ ] `node scripts/cleanup.mjs --dry-run` then real run if `WRITE_MODE≠off`
- [ ] Confirm production latency back to baseline
- [ ] Fill in §11 and circulate

---

## 11. Results (fill in)

> Live results are tracked in [`RESULTS.md`](./RESULTS.md). As of 2026-09-09 the
> load scenarios have **not been run** — blocked on the test-account pool and
> production sign-off. See `RESULTS.md §4`.

**Run:** _date / time / window_
**Target:** _BASE_URL + prefix_ · **Generator:** _VM type, region_ · **k6:** _version_ · **API build:** _commit_
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
| login-storm | login p95 at 500/s: ___ | | | | CPU saturates at ___ /s |

### Capacity statement

- Sustained knee: **___ req/s** / **___ concurrent VUs** / **___ concurrent sockets**
- Headroom over modelled peak: **___×**
- Estimated supportable concurrent active users: **___**
- First bottleneck: **___** (evidence: ___)
- Second: **___**

### Recommendations

1.
2.
3.

---

## Appendix A — endpoint inventory

Method · path · used by · side effects / limits. Source: `lib/api/endpoints.ts`.

| Method | Path (`…/v1/mobile` prefix omitted) | In journey? | Notes |
|---|---|---|---|
| POST | `/auth/login` | yes (all) | password KDF; possible server lockout |
| POST | `/auth/refresh` | yes (on 401) | rotates access token |
| POST | `/auth/forgot-password` | **no** | sends email/SMS |
| POST | `/auth/password` | **no** | mutates account |
| POST | `/auth/logout` | **no** | disables push token |
| GET | `/me` | yes (all) | role-aware |
| GET | `/me/branding` | yes (all) | resolves group→org→stock |
| GET | `/app-config` | yes (all) | |
| GET | `/geofence` | student (opt) | 404 when campus has no fence |
| POST | `/location/ping` | student, `LOCATION_PINGS=on` | writes a location row |
| GET | `/permissions/summary` | student | home screen |
| GET | `/permissions` | student | cursor-paginated |
| GET | `/permissions/:id` | student | |
| POST | `/permissions/submit` | write-ring, `WRITE_MODE≥light` | real row + warden push |
| POST | `/permissions/:id/cancel` | write-ring (self-clean) | |
| GET | `/curfew` | student | |
| GET | `/categories` | student | |
| GET | `/parent/children` | parent | |
| GET | `/parent/children/:id` | parent | |
| GET | `/parent/children/:id/location` | parent | 404 when not enabled |
| GET | `/parent/permissions` | parent | `decided` filter |
| GET | `/parent/permissions/:id` | parent | |
| POST | `/parent/permissions/:id/decision` | write-ring, `WRITE_MODE=full` | **1/5 s throttle**; notifies student |
| GET | `/parent/children/:id/late-entries` | parent (opt) | |
| POST | `/parent/emergencies` | **NO — never** | pages every warden of the site |
| GET | `/warden/dashboard` | warden | |
| GET | `/warden/permissions` | warden | |
| POST | `/warden/permissions/:id/decision` | write-ring, `WRITE_MODE=full` | 1/5 s throttle |
| POST | `/warden/permissions/:id/activate` `/end` `/resolve-escalated` | **no** (add only on test tenant) | state machine + late-entry writes |
| GET | `/admin/stats` `/activity` `/permissions` `/permissions/:id` | warden/admin | |
| POST | `/admin/permissions/:id/override` | **no** | bypasses state machine, audit-logged |
| GET | `/admin/emergencies` | warden/admin | read only |
| POST | `/admin/emergencies/:id/resolve` | **no** | |
| GET | `/admin/announcements` | admin | read only |
| POST | `/admin/announcements` | **NO — never** | pushes every recipient |
| GET | `/admin/roster` `/groups` `/groups/:id` | admin | |
| POST/PUT | `/admin/groups*` `/admin/users/:id/role` | **no** | mutate config/accounts |
| GET | `/admin/profile-requests` | admin | |
| POST | `/admin/profile-requests/:id/approve` `/reject` | **no** | writes to student record |
| GET | `/admin/*/export` | **no** (run 1–2 by hand if measuring) | CSV, ≤ 5000 rows |
| GET | `/notifications` `/notifications/unread-count` | yes (all) | |
| PATCH | `/notifications/:id/read` `/read-all` | **no** | mutates state (benign) |
| GET/PUT | `/notification-preferences` | **no** | |
| POST/DEL | `/push/token` | **no** | device registration |
| POST/GET | `/uploads` `/uploads/signed-url` | **no** | object storage + egress |
| GET | `/profile-requests/fields` `/profile-requests` | student/parent (opt) | |
| POST | `/profile-requests` | **no** | `409` if one already open |

## Appendix B — Socket.IO frame reference

socket.io-client 4.x (`lib/live.ts`) with `transports: ['websocket']`:

```
1. WS connect  wss://<host>/hostel/socket.io/?EIO=4&transport=websocket
2. server →    0{"sid":"…","pingInterval":25000,"pingTimeout":20000,…}
3. client →    40/mobile,{"token":"<JWT>"}          (CONNECT to the /mobile namespace)
4. server →    40/mobile,{"sid":"…"}                (CONNECT ack — success)
        or     44/mobile,{"message":"…"}            (CONNECT_ERROR — bad/expired token)
5. server →    2        (PING, every pingInterval)   → client must reply  3  (PONG)
6. server →    42/mobile,["permission:updated",{…}]  (events: notification:new,
                                                       permission:updated, branding:updated)
```

`k6/socket.js` implements exactly this.
