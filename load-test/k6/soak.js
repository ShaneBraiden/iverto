/**
 * Soak test — a moderate load held for hours. Catches what a short run cannot:
 * memory creeping up, DB connection-pool exhaustion, a slow log disk filling,
 * access tokens expiring at the 1-hour mark and the refresh path misbehaving
 * under sustained use.
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel \
 *          --summary-export results/soak-summary.json \
 *          --out json=results/soak-raw.json k6/soak.js
 *
 * Default 25 journeys/second for 2 hours. Run k6/socket.js (with a long
 * WS_HOLD_MS) alongside it. Compare the server's memory graph at start vs end.
 *
 * Knobs:  -e RATE=25   -e DURATION=2h
 */
import { THRESHOLDS } from './lib/config.js';
import { runJourney } from './lib/journey.js';

const RATE = Number(__ENV.RATE || 25);

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '2h',
      preAllocatedVUs: Math.ceil(RATE * 12),
      maxVUs: Math.ceil(RATE * 25),
    },
  },
  thresholds: THRESHOLDS,
};

export default function () {
  runJourney();
}
