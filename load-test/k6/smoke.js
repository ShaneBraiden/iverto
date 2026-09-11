/**
 * Smoke test — 3 VUs, ~30 iterations. Not a load test: it proves the script,
 * the account pool and the SLO thresholds all work before you spend an hour on
 * a real run.
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel k6/smoke.js
 */
import { sleep } from 'k6';
import { THRESHOLDS } from './lib/config.js';
import { countByRole } from './lib/accounts.js';
import { runJourney } from './lib/journey.js';

export const options = {
  scenarios: {
    smoke: { executor: 'shared-iterations', vus: 3, iterations: 30, maxDuration: '3m' },
  },
  thresholds: THRESHOLDS,
};

export function setup() {
  console.log(`account pool by role: ${JSON.stringify(countByRole())}`);
}

export default function () {
  runJourney();
  sleep(1);
}
