/**
 * Picks a role for each VU from ROLE_MIX, binds it to an account, and runs that
 * role's journey. This is the default function for the mixed-traffic scripts
 * (smoke / load / stress / spike / soak).
 */
import { ROLE_MIX } from './config.js';
import { accountForVU } from './accounts.js';
import { ensureAuth } from './http.js';
import { studentJourney, parentJourney, wardenJourney, adminJourney } from './flows.js';
import { journeyErrors } from './metrics.js';

/** Stable per-VU role: hash __VU into 0..1 and bucket it against ROLE_MIX. */
function roleForVU() {
  const r = ((__VU * 2654435761) % 1000) / 1000; // cheap deterministic spread
  for (const bucket of ROLE_MIX) {
    if (r < bucket.upto) return bucket.role;
  }
  return ROLE_MIX[ROLE_MIX.length - 1].role;
}

let _account = null;
let _role = null;

export function runJourney() {
  if (!_account) {
    _role = roleForVU();
    _account = accountForVU(_role);
    _role = _account.role; // fall back to whatever the pool actually gave us
  }

  if (!ensureAuth(_account)) {
    journeyErrors.add(1, { name: 'auth' });
    return;
  }

  switch (_role) {
    case 'parent':
      return parentJourney();
    case 'warden':
      return wardenJourney();
    case 'admin':
      return adminJourney();
    default:
      return studentJourney();
  }
}
