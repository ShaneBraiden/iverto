/**
 * v2 concurrent users — a closed model: USERS virtual users, each repeatedly
 * opening the app (one role journey) then idling, like a real person.
 * Ramp 1m -> hold HOLD -> ramp down 30s. Fits the ~15 min token lifetime.
 *   k6 run -e USERS=100 -e HOLD=4m k6/v2/users.js
 */
import { sleep } from 'k6';
import { runJourney, THRESHOLDS } from './lib.js';

const USERS = Number(__ENV.USERS || 30);

export const options = {
  scenarios: {
    users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: USERS, duration: '1m' },
        { target: USERS, duration: __ENV.HOLD || '4m' },
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: THRESHOLDS,
};

export default function () {
  runJourney();
  sleep(Math.random() * 5 + 3); // idle 3-8 s between app opens
}
