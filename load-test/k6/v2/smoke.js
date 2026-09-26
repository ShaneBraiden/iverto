/** v2 smoke — every role's journey a few times at 1 VU each. ~1 min. */
import { runJourney, THRESHOLDS } from './lib.js';

export const options = {
  scenarios: {
    student: { executor: 'per-vu-iterations', vus: 1, iterations: 5, env: { R: 'student' } },
    parent: { executor: 'per-vu-iterations', vus: 1, iterations: 5, env: { R: 'parent' } },
    warden: { executor: 'per-vu-iterations', vus: 1, iterations: 4, env: { R: 'warden' } },
    admin: { executor: 'per-vu-iterations', vus: 1, iterations: 4, env: { R: 'admin' } },
  },
  thresholds: THRESHOLDS,
};

export default function () {
  runJourney(__ENV.R);
}
