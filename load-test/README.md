# load-test

Load / stress test suite for the **Iverto Outpass backend** — the REST API at
`api.iverto.ai/hostel/v1/mobile/**` and the Socket.IO gateway that the mobile app
in this repo talks to. Built on [k6](https://k6.io).

> This tests the **backend's capacity**, not the app. A React Native client runs
> one instance per phone and has nothing to load-test.

## Start here

| Doc | What it's for |
|---|---|
| **[TEST-PLAN.md](./TEST-PLAN.md)** | The plan: what we're measuring, the workload model, the SLOs, the scenarios, and the risk analysis. Read §9 before touching production. |
| **[RUNBOOK.md](./RUNBOOK.md)** | Step-by-step: install, configure, run each test, read the output, clean up. |
| **[RESULTS.md](./RESULTS.md)** | What has actually been run and found. As of 2026-09-09: environment validated + baseline captured; load scenarios **not yet run** (blocked on test accounts + prod sign-off). |

## 60-second version

```bash
cd load-test
cp data/accounts.example.json data/accounts.json   # fill in real test credentials

# PowerShell:  $env:BASE_URL="https://api.iverto.ai"; $env:API_PREFIX="/hostel"
# bash:        export BASE_URL=https://api.iverto.ai API_PREFIX=/hostel

node scripts/verify-accounts.mjs     # pre-flight: can we log in?
k6 run k6/smoke.js                   # does the script work?
k6 run --summary-export results/load-summary.json k6/load.js   # the expected peak
k6 run --summary-export results/stress-summary.json k6/stress.js  # find the ceiling
```

Default `WRITE_MODE=off` → GET + login only, safe against production. Everything
else about safety, cloud-VM setup, live dashboards, and cleanup is in the RUNBOOK.

## Layout

```
k6/
  smoke.js        3 VUs — validate the setup
  load.js         expected busy-hour peak (30 journeys/s) — must pass
  stress.js       ramp to breaking point — find the knee
  spike.js        broadcast-push burst + recovery
  soak.js         2 h endurance — leaks, token refresh
  socket.js       Socket.IO gateway — concurrent connection capacity
  login-storm.js  auth-only CPU load
  lib/            shared: config, auth, per-role journeys, metrics
scripts/
  verify-accounts.mjs   log in every account, report failures
  cleanup.mjs           cancel test-created outpasses (WRITE_MODE runs)
data/
  accounts.example.json template — copy to accounts.json (git-ignored)
observability/          optional Prometheus + Grafana for live charts
results/                run output (git-ignored)
```
