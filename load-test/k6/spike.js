/**
 * Spike test — a flat baseline, then a near-instant jump. Models the real
 * event where an admin sends an announcement (admin.announce) or a curfew
 * reminder fires: every recipient gets a push and opens the app inside a
 * minute. What matters is whether the API absorbs it and, just as important,
 * whether it recovers to baseline latency afterwards.
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel \
 *          --summary-export results/spike-summary.json k6/spike.js
 *
 * Knob:  -e SPIKE=300   journeys/second at the top of the spike
 */
import { runJourney } from './lib/journey.js';

const BASE = Number(__ENV.BASE || 8);
const SPIKE = Number(__ENV.SPIKE || 300);

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: BASE,
      timeUnit: '1s',
      preAllocatedVUs: 400,
      maxVUs: 5000,
      stages: [
        { target: BASE, duration: '2m' }, // settle at baseline
        { target: SPIKE, duration: '15s' }, // the push lands
        { target: SPIKE, duration: '3m' }, // everyone is in the app
        { target: BASE, duration: '15s' }, // it passes
        { target: BASE, duration: '3m' }, // <- did latency return to baseline?
      ],
    },
  },
  thresholds: {
    'http_req_duration{kind:read}': ['p(95)<1200'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.97'],
  },
};

export default function () {
  runJourney();
}
