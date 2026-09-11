/**
 * The one place these scripts talk to the API — a thin echo of lib/api/client.ts.
 *
 * Per-VU state: each k6 VU runs an isolated JS runtime, so the module-level
 * token below is that VU's own. A VU logs in on its first iteration, reuses the
 * token after that, and refreshes once on a 401 exactly like the app does.
 */
import http from 'k6/http';
import { check } from 'k6';
import { API } from './config.js';
import { loginDuration, loginFailures } from './metrics.js';

let _token = null;
let _refresh = null;
let _account = null;

/** The account this VU is acting as, for the write-ring gate in flows.js. */
export function currentAccount() {
  return _account;
}

export function authToken() {
  return _token;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

/** POST /auth/login. Returns true on success. */
export function login(acc) {
  const body = { identifier: acc.identifier, password: acc.password };
  if (acc.role) body.role = acc.role;
  if (acc.tenantId) body.tenantId = acc.tenantId;

  const res = http.post(`${API}/auth/login`, JSON.stringify(body), {
    headers: jsonHeaders,
    tags: { name: 'POST /auth/login', kind: 'auth' },
  });
  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    'login status 2xx': (r) => r.status === 200 || r.status === 201,
    'login returned accessToken': (r) => {
      try {
        return !!r.json('accessToken');
      } catch (e) {
        return false;
      }
    },
  });

  if (!ok) {
    loginFailures.add(1);
    return false;
  }

  _token = res.json('accessToken');
  _refresh = res.json('refreshToken');
  _account = acc;
  return true;
}

/** Log in if this VU has no token yet. */
export function ensureAuth(acc) {
  if (_token) return true;
  return login(acc);
}

function refresh() {
  if (!_refresh) return false;
  const res = http.post(`${API}/auth/refresh`, JSON.stringify({ refreshToken: _refresh }), {
    headers: jsonHeaders,
    tags: { name: 'POST /auth/refresh', kind: 'auth' },
  });
  if (res.status !== 200 && res.status !== 201) return false;
  try {
    _token = res.json('accessToken');
    if (res.json('refreshToken')) _refresh = res.json('refreshToken');
    return true;
  } catch (e) {
    return false;
  }
}

/** Authenticated GET, tagged `kind:read`, with one refresh-and-retry on 401. */
export function apiGet(path, name) {
  const send = () =>
    http.get(`${API}${path}`, {
      headers: { Authorization: `Bearer ${_token}` },
      tags: { name, kind: 'read' },
    });
  let res = send();
  if (res.status === 401 && refresh()) res = send();
  return res;
}

/** Authenticated write, tagged `kind:write`, with one refresh-and-retry on 401. */
export function apiWrite(method, path, name, payload) {
  const send = () =>
    http.request(method, `${API}${path}`, payload ? JSON.stringify(payload) : null, {
      headers: { Authorization: `Bearer ${_token}`, ...jsonHeaders },
      tags: { name, kind: 'write' },
    });
  let res = send();
  if (res.status === 401 && refresh()) res = send();
  return res;
}
