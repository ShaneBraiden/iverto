/**
 * v2 stress — step the arrival rate up until the SLOs break, to find the knee.
 * Fits the ~15 min token lifetime (log a fresh pool in first).
 * Aborts on collapse: >25% errors sustained 30s. Knob: -e PEAK=150
 */
import { runJourney } from './lib.js';

const PEAK = Number(__ENV.PEAK || 150);
const step = (f, d) => ({ target: Math.round(PEAK * f), duration: d });

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 4000,
      stages: [
        step(0.1, '1m'),
        step(0.2, '1m30s'),
        step(0.4, '1m30s'),
        step(0.6, '1m30s'),
        step(0.8, '1m30s'),
        step(1.0, '1m30s'),
        step(0, '30s'),
      ],
    },
  },
  thresholds: {
    'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<2000'],
    checks: ['rate>0.99'],
    http_req_failed: [{ threshold: 'rate<0.25', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export default function () {
  runJourney();
}
