/**
 * v2 load — expected busy-hour peak (TEST-PLAN.md §4: ~30 journeys/s gives
 * ~4x headroom over a 2,000-user hostel). Shortened to fit the ~15 min
 * access-token lifetime. Knobs: -e RATE=30 -e DURATION=5m
 */
import { runJourney, THRESHOLDS } from './lib.js';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 150,
      maxVUs: 1500,
      stages: [
        { target: Number(__ENV.RATE || 30), duration: '1m' },
        { target: Number(__ENV.RATE || 30), duration: __ENV.DURATION || '5m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: THRESHOLDS,
};

export default function () {
  runJourney();
}
