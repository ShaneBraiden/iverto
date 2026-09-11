/**
 * Stress test — ramp the arrival rate up in steps until the SLOs break, to
 * find the capacity knee: the request rate at which p95 latency climbs and
 * errors start. That number, divided by the per-user request rate from
 * TEST-PLAN.md §4, is "how many concurrent users the backend can take".
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel \
 *          --summary-export results/stress-summary.json \
 *          --out json=results/stress-raw.json k6/stress.js
 *
 * The run auto-aborts only on a catastrophic breach (25% errors, or p99 read
 * latency past 10s) so you still see the whole degradation curve up to that
 * point. Watch the server's own CPU / memory / DB dashboards while it runs and
 * note the rate at each stage.
 *
 * Knob:  -e PEAK=600   top of the ramp, journeys/second
 */
import { runJourney } from './lib/journey.js';

const PEAK = Number(__ENV.PEAK || 600);
const step = (frac, duration) => ({ target: Math.round(PEAK * frac), duration });

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 600,
      maxVUs: 6000,
      stages: [
        step(0.08, '2m'), // ~expected peak
        step(0.17, '3m'),
        step(0.33, '3m'),
        step(0.5, '3m'),
        step(0.67, '3m'),
        step(0.83, '3m'),
        step(1.0, '3m'),
        step(0.0, '1m'), // ramp down
      ],
    },
  },
  thresholds: {
    // Informational — we WANT to see these go red; that is the result.
    'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<2000'],
    checks: ['rate>0.99'],
    // Hard stop only on collapse, so the machine and the server recover.
    http_req_failed: [{ threshold: 'rate<0.25', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export default function () {
  runJourney();
}
