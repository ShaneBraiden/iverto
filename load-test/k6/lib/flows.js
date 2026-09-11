/**
 * Per-role user journeys — the request patterns lib/api/endpoints.ts drives
 * when a real person opens the app and pokes around.
 *
 * Each journey starts with the "app open" fan-out (AppContext + the role's
 * dashboard), then a weighted set of follow-on screens. Think time between
 * screens keeps server-side concurrency realistic rather than firing every
 * call in the same millisecond.
 *
 * Writes are gated by WRITE_MODE / LOCATION_PINGS in config.js and only ever
 * come from accounts flagged `write: true`.
 */
import { check, sleep } from 'k6';
import { WRITE_MODE, LOCATION_PINGS, RUN_TAG } from './config.js';
import { apiGet, apiWrite, currentAccount } from './http.js';
import { journeyErrors, writesCreated } from './metrics.js';

/* ------------------------------------------------------------- helpers */

const rnd = (a, b) => Math.random() * (b - a) + a;
const chance = (p) => Math.random() < p;
const think = () => sleep(rnd(0.4, 1.6));

function ok(res, name) {
  const good = check(res, { [`${name} -> 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  if (!good) journeyErrors.add(1, { name });
  return good;
}

/**
 * A random `id` from a list response. `key` is the array's field name for a
 * paged body (`data`, `permissions`); omit it when the body is a bare array
 * (e.g. GET /parent/children returns `Ward[]`).
 */
function pickId(res, key) {
  try {
    const arr = key ? res.json(key) : res.json();
    if (Array.isArray(arr) && arr.length) return arr[Math.floor(Math.random() * arr.length)].id;
  } catch (e) {
    /* fall through */
  }
  return null;
}

function isWriteRing() {
  const acc = currentAccount();
  return !!acc && acc.write === true;
}

/* ---------------------------------------------------------- app open */

/** AppContext.tsx: config + branding + unread-count. Plus GET /me from _layout. */
function appOpen() {
  ok(apiGet('/me', 'GET /me'), 'GET /me');
  ok(apiGet('/me/branding', 'GET /me/branding'), 'GET /me/branding');
  ok(apiGet('/app-config', 'GET /app-config'), 'GET /app-config');
  ok(
    apiGet('/notifications/unread-count', 'GET /notifications/unread-count'),
    'GET /notifications/unread-count'
  );
}

/* ------------------------------------------------------ student journey */

let _lastPingAt = 0;

export function studentJourney() {
  appOpen();
  think();

  // student/index.tsx dashboard
  ok(apiGet('/permissions/summary', 'GET /permissions/summary'), 'GET /permissions/summary');
  ok(apiGet('/curfew', 'GET /curfew'), 'GET /curfew');

  if (chance(0.7)) {
    // request.tsx / history.tsx both read categories
    ok(apiGet('/categories', 'GET /categories'), 'GET /categories');
  }

  if (chance(0.45)) {
    think();
    const list = apiGet('/permissions?status=all&limit=20', 'GET /permissions');
    ok(list, 'GET /permissions');
    const id = pickId(list, 'data');
    if (id && chance(0.5)) {
      think();
      ok(apiGet(`/permissions/${id}`, 'GET /permissions/:id'), 'GET /permissions/:id');
    }
  }

  if (chance(0.25)) {
    think();
    ok(apiGet('/notifications?limit=20', 'GET /notifications'), 'GET /notifications');
  }

  maybeLocationPing();
  maybeSubmitPass();
}

function maybeLocationPing() {
  if (!LOCATION_PINGS) return;
  // lib/location.tsx: at most one ping a minute per device
  const now = Date.now();
  if (now - _lastPingAt < 60000) return;
  _lastPingAt = now;

  const res = apiWrite('POST', '/location/ping', 'POST /location/ping', {
    latitude: 12.9716 + rnd(-0.01, 0.01),
    longitude: 77.5946 + rnd(-0.01, 0.01),
    accuracyMeters: Math.round(rnd(5, 30)),
    at: new Date().toISOString(),
    inside: chance(0.6),
  });
  if (check(res, { 'ping accepted': (r) => r.status >= 200 && r.status < 300 })) {
    writesCreated.add(1, { name: 'POST /location/ping' });
  }
}

function maybeSubmitPass() {
  if (WRITE_MODE === 'off' || !isWriteRing()) return;
  if (!chance(0.3)) return;

  const now = Date.now();
  const res = apiWrite('POST', '/permissions/submit', 'POST /permissions/submit', {
    type: 'home',
    reason: `${RUN_TAG} — automated load test, safe to cancel`,
    destination: 'Load test (automated)',
    startDate: new Date(now + 3600e3).toISOString(),
    endDate: new Date(now + 3 * 3600e3).toISOString(),
    emergencyContact: '0000000000',
  });

  if (!check(res, { 'submit -> 2xx': (r) => r.status >= 200 && r.status < 300 })) {
    journeyErrors.add(1, { name: 'POST /permissions/submit' });
    return;
  }
  writesCreated.add(1, { name: 'POST /permissions/submit' });

  // Self-clean: cancel it straight back unless a run explicitly keeps them.
  if (__ENV.KEEP_WRITES === 'true') return;
  let id = null;
  try {
    id = res.json('id');
  } catch (e) {
    /* ignore */
  }
  if (id) {
    think();
    apiWrite('POST', `/permissions/${id}/cancel`, 'POST /permissions/:id/cancel');
  }
}

/* ------------------------------------------------------- parent journey */

let _lastDecideAt = 0;

export function parentJourney() {
  appOpen();
  think();

  const kids = apiGet('/parent/children', 'GET /parent/children');
  ok(kids, 'GET /parent/children');
  const kidId = pickId(kids); // GET /parent/children is a bare Ward[]

  const queue = apiGet('/parent/permissions?decided=false', 'GET /parent/permissions?decided=false');
  ok(queue, 'GET /parent/permissions?decided=false');
  think();

  if (chance(0.5)) {
    ok(
      apiGet('/parent/permissions?decided=true&limit=20', 'GET /parent/permissions?decided=true'),
      'GET /parent/permissions?decided=true'
    );
  }

  const pendingId = pickId(queue, 'permissions');
  if (pendingId && chance(0.6)) {
    think();
    ok(
      apiGet(`/parent/permissions/${pendingId}`, 'GET /parent/permissions/:id'),
      'GET /parent/permissions/:id'
    );
  }

  if (kidId && chance(0.3)) {
    think();
    ok(apiGet(`/parent/children/${kidId}`, 'GET /parent/children/:id'), 'GET /parent/children/:id');
    if (chance(0.4)) {
      ok(
        apiGet(`/parent/children/${kidId}/location`, 'GET /parent/children/:id/location'),
        'GET /parent/children/:id/location'
      );
    }
  }

  maybeDecide(
    `/parent/permissions/${pendingId}/decision`,
    'POST /parent/permissions/:id/decision',
    pendingId
  );
}

/* ---------------------------------------------- warden / admin journey */

export function wardenJourney() {
  appOpen();
  think();

  ok(apiGet('/warden/dashboard', 'GET /warden/dashboard'), 'GET /warden/dashboard');
  const q = apiGet('/warden/permissions', 'GET /warden/permissions');
  ok(q, 'GET /warden/permissions');
  ok(apiGet('/admin/stats', 'GET /admin/stats'), 'GET /admin/stats');
  think();

  if (chance(0.6)) ok(apiGet('/admin/activity?limit=20', 'GET /admin/activity'), 'GET /admin/activity');
  if (chance(0.5))
    ok(apiGet('/admin/emergencies?status=open', 'GET /admin/emergencies'), 'GET /admin/emergencies');

  const id = pickId(q, 'data');
  if (id && chance(0.5)) {
    think();
    ok(apiGet(`/admin/permissions/${id}`, 'GET /admin/permissions/:id'), 'GET /admin/permissions/:id');
  }

  if (id)
    maybeDecide(`/warden/permissions/${id}/decision`, 'POST /warden/permissions/:id/decision', id);
}

export function adminJourney() {
  appOpen();
  think();

  ok(apiGet('/admin/stats', 'GET /admin/stats'), 'GET /admin/stats');
  ok(apiGet('/admin/activity?limit=20', 'GET /admin/activity'), 'GET /admin/activity');
  ok(apiGet('/warden/permissions', 'GET /warden/permissions'), 'GET /warden/permissions');
  think();

  if (chance(0.5)) ok(apiGet('/admin/roster?limit=20', 'GET /admin/roster'), 'GET /admin/roster');
  if (chance(0.4)) ok(apiGet('/admin/groups', 'GET /admin/groups'), 'GET /admin/groups');
  if (chance(0.4))
    ok(apiGet('/admin/profile-requests', 'GET /admin/profile-requests'), 'GET /admin/profile-requests');
  if (chance(0.3))
    ok(apiGet('/admin/announcements?limit=10', 'GET /admin/announcements'), 'GET /admin/announcements');
  if (chance(0.4))
    ok(apiGet('/admin/emergencies?status=open', 'GET /admin/emergencies'), 'GET /admin/emergencies');
}

/* --------------------------------------------------------- shared write */

function maybeDecide(path, name, targetId) {
  if (WRITE_MODE !== 'full' || !isWriteRing() || !targetId) return;
  if (!chance(0.5)) return;

  // The API throttles decisions to 1 per 5s; stay clear of it per-VU.
  const now = Date.now();
  if (now - _lastDecideAt < 6000) return;
  _lastDecideAt = now;

  const res = apiWrite('POST', path, name, { response: 'approve', note: `${RUN_TAG} automated` });
  // 409 = already decided by another VU, which is a fine outcome here.
  if (check(res, { [`${name} -> ok/409`]: (r) => [200, 201, 409].includes(r.status) })) {
    writesCreated.add(1, { name });
  } else {
    journeyErrors.add(1, { name });
  }
}
