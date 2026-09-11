/**
 * Central configuration for every k6 script.
 *
 * Nothing here is secret. Real values come from the environment at run time:
 *
 *   k6 run -e BASE_URL=https://api.iverto.ai -e API_PREFIX=/hostel k6/load.js
 *
 * The defaults point at the same host the mobile app ships with
 * (app.json -> extra.apiUrl), so a bare `k6 run` hits production. Change
 * BASE_URL / API_PREFIX to aim somewhere safer.
 */

const env = (key, fallback) =>
  __ENV[key] !== undefined && __ENV[key] !== '' ? __ENV[key] : fallback;

const trimSlash = (s) => String(s).replace(/\/+$/, '');

/** Origin only, no path. `https://api.iverto.ai`. */
export const BASE_URL = trimSlash(env('BASE_URL', 'https://api.iverto.ai'));

/**
 * The deployment prefix Caddy routes on. `/hostel` in production,
 * `/devhostel` on the dev deployment, empty for a local backend run without
 * API_PREFIX set. Mirrors the `/hostel` segment in EXPO_PUBLIC_API_URL.
 */
export const API_PREFIX = trimSlash(env('API_PREFIX', '/hostel'));

/** Socket.IO handshake prefix. Same as API_PREFIX unless the backend differs. */
export const WS_PREFIX = trimSlash(env('WS_PREFIX', API_PREFIX));

/** Version segment. Every mobile path in lib/api/endpoints.ts starts here. */
export const V1 = '/v1/mobile';

/** Fully-qualified REST root: `https://api.iverto.ai/hostel/v1/mobile`. */
export const API = `${BASE_URL}${API_PREFIX}${V1}`;

/**
 * Engine.IO v4 websocket URL. socket.io-client 4.x (what the app uses) opens
 *   wss://api.iverto.ai/hostel/socket.io/?EIO=4&transport=websocket
 * then CONNECTs to the `/mobile` namespace (see lib/live.ts).
 */
export const WS_URL =
  `${BASE_URL.replace(/^http/, 'ws')}${WS_PREFIX}/socket.io/?EIO=4&transport=websocket`;
export const WS_NAMESPACE = '/mobile';

/**
 * Path to the account pool, relative to THIS file (k6 resolves open() against
 * the calling module, not the shell cwd). Override with an absolute path.
 */
export const ACCOUNTS_FILE = env('ACCOUNTS_FILE', '../../data/accounts.json');

/**
 * What write traffic the journeys are allowed to send.
 *
 *   off   (default) — GET only, plus POST /auth/login and /auth/refresh.
 *                     Safe against production.
 *   light           — write-ring accounts also POST /permissions/submit and
 *                     immediately cancel it (self-cleaning). Nothing fans out
 *                     to another real person.
 *   full            — light, plus parent/warden decisions between write-ring
 *                     accounts. Requires a dedicated test site/tenant.
 *
 * See load-test/TEST-PLAN.md §3 (Scope) before raising this.
 */
export const WRITE_MODE = env('WRITE_MODE', 'off');

/** on -> student journeys also POST /location/ping (writes location rows). */
export const LOCATION_PINGS = env('LOCATION_PINGS', 'off') === 'on';

/**
 * Stamped into every record the test creates (`reason`, decision `note`), so
 * scripts/cleanup.mjs can find and cancel them afterwards.
 */
export const RUN_TAG = env('RUN_TAG', `loadtest-${new Date().toISOString().slice(0, 16)}`);

/**
 * Role weighting for the mixed journey. A hostel deployment is mostly students
 * opening the app, a smaller wave of guardians reacting to approval pushes, and
 * a handful of wardens working the queue continuously. Override as a
 * comma list: -e ROLE_MIX=student:70,parent:20,warden:8,admin:2
 */
export const ROLE_MIX = parseMix(env('ROLE_MIX', 'student:80,parent:15,warden:4,admin:1'));

function parseMix(spec) {
  const out = [];
  let cum = 0;
  for (const part of spec.split(',')) {
    const [role, weight] = part.split(':');
    cum += Number(weight);
    out.push({ role: role.trim(), upto: cum });
  }
  // normalise to 0..1
  return out.map((m) => ({ role: m.role, upto: m.upto / cum }));
}

/**
 * Pass/fail SLOs. A run that breaches any of these is a failed run — that is
 * the whole point of a threshold. Rationale is in TEST-PLAN.md §6.
 *
 *   kind:read   tag  -> GET endpoints
 *   kind:write  tag  -> POST/PUT/PATCH that change state
 *   kind:auth   tag  -> login / refresh (deliberately slow: password KDF)
 *
 * The write threshold is only added when the run actually sends writes — k6
 * errors on a threshold over a sub-metric that never receives a sample.
 */
const WRITES_ON = WRITE_MODE !== 'off' || LOCATION_PINGS;

export const THRESHOLDS = Object.assign(
  {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{kind:auth}': ['p(95)<1500', 'p(99)<3000'],
    login_failures: ['count<1'],
    journey_errors: ['count<1'],
  },
  WRITES_ON ? { 'http_req_duration{kind:write}': ['p(95)<1500', 'p(99)<4000'] } : {}
);
