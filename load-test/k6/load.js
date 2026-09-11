/**
 * Load test — the expected busy-hour peak for a 500–2,000 user deployment.
 *
 * Model (TEST-PLAN.md §4): the pre-curfew rush. A steady arrival of "someone
 * opens the app and browses" journeys. Default 30 new journeys/second for
 * 20 minutes ≈ the sustained peak with headroom; run k6/socket.js alongside so
 * the gateway is holding its share of connections at the same time.
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel \
 *          --summary-export results/load-summary.json k6/load.js
 *
 * Knobs:  -e RATE=30   journeys per second
 *         -e DURATION=20m
 */
import { THRESHOLDS } from './lib/config.js';
import { runJourney } from './lib/journey.js';

const RATE = Number(__ENV.RATE || 30);

export const options = {
  scenarios: {
    peak: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '20m',
      preAllocatedVUs: Math.ceil(RATE * 12),
      maxVUs: Math.ceil(RATE * 30),
    },
  },
  thresholds: THRESHOLDS,
};

export default function () {
  runJourney();
}
