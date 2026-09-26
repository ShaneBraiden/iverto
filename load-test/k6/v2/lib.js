/**
 * Hostel v2 journeys — the read fan-out lib/api/endpoints.ts drives on the v2
 * surface (`{API_PREFIX}/v2/tenants/{tenantId}/...`) for each role.
 *
 * Auth: VUs do NOT log in. Public-auth (login + refresh) is limited to ~10/min
 * per IP, so tokens are pre-issued by scripts/login-pool-v2.mjs into
 * data/tokens.json and shared across VUs. Reads only — nothing here writes.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const env = (k, d) => (__ENV[k] !== undefined && __ENV[k] !== '' ? __ENV[k] : d);
const BASE_URL = env('BASE_URL', 'https://api.iverto.ai').replace(/\/+$/, '');
const API_PREFIX = env('API_PREFIX', '/devhostel').replace(/\/+$/, '');
export const V2 = `${BASE_URL}${API_PREFIX}/v2`;

export const journeyErrors = new Counter('journey_errors');

const tokens = new SharedArray('tokens', () => {
  const t = JSON.parse(open(env('TOKENS_FILE', '../../data/tokens.json')));
  if (!t.length) throw new Error('data/tokens.json empty — run scripts/login-pool-v2.mjs');
  return t;
});

const byRole = (r) => tokens.filter((t) => t.role === r);
const POOLS = { student: byRole('student'), parent: byRole('parent'), warden: byRole('warden'), admin: byRole('admin') };

const MIX = (() => {
  let cum = 0;
  const out = [];
  for (const p of env('ROLE_MIX', 'student:80,parent:15,warden:4,admin:1').split(',')) {
    const [r, w] = p.split(':');
    cum += Number(w);
    out.push({ role: r, upto: cum });
  }
  return out.map((m) => ({ role: m.role, upto: m.upto / cum }));
})();

const rnd = (a, b) => Math.random() * (b - a) + a;
const chance = (p) => Math.random() < p;
const think = () => sleep(rnd(0.4, 1.6));

let T = null;

function get(path, name) {
  const res = http.get(`${V2}/tenants/${T.tenantId}${path}`, {
    headers: { Authorization: `Bearer ${T.accessToken}` },
    tags: { name, kind: 'read', role: T.role },
    timeout: '30s',
  });
  const good = check(res, { [`${name} -> 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  if (!good) journeyErrors.add(1, { name, status: String(res.status) });
  return res;
}

function pickId(res, key) {
  try {
    const arr = res.json(key);
    if (Array.isArray(arr) && arr.length) return arr[Math.floor(Math.random() * arr.length)].id;
  } catch (e) {
    /* non-JSON or empty */
  }
  return null;
}

function appOpen() {
  get('/me/branding', 'GET /me/branding');
  get('/app-config', 'GET /app-config');
  get('/me/notifications/unread-count', 'GET /me/notifications/unread-count');
}

function student() {
  get('/me/student', 'GET /me/student');
  get('/sites', 'GET /sites');
  appOpen();
  think();
  get('/me/permissions/summary', 'GET /me/permissions/summary');
  get('/me/permissions?limit=5', 'GET /me/permissions');
  get('/me/curfew', 'GET /me/curfew');
  if (chance(0.7)) get('/categories', 'GET /categories');
  if (chance(0.45)) {
    think();
    const list = get('/me/permissions?limit=20', 'GET /me/permissions');
    const id = pickId(list, 'items');
    if (id && chance(0.5)) get(`/me/permissions/${id}`, 'GET /me/permissions/:id');
  }
  if (chance(0.25)) {
    think();
    get('/me/notifications?limit=20', 'GET /me/notifications');
  }
}

function parent() {
  get('/me', 'GET /me');
  const kids = get('/me/children', 'GET /me/children');
  appOpen();
  think();
  const q = get('/me/guardian-permissions?limit=20', 'GET /me/guardian-permissions');
  const kid = pickId(kids, 'data');
  const pid = pickId(q, 'items');
  if (pid && chance(0.6)) get(`/me/guardian-permissions/${pid}`, 'GET /me/guardian-permissions/:id');
  if (kid && chance(0.3)) {
    think();
    get(`/me/children/${kid}`, 'GET /me/children/:id');
    get(`/me/children/${kid}/guardians`, 'GET /me/children/:id/guardians');
    if (chance(0.4)) get(`/me/children/${kid}/late-entries`, 'GET /me/children/:id/late-entries');
  }
}

function warden() {
  get('/me', 'GET /me');
  get('/sites', 'GET /sites');
  appOpen();
  think();
  get('/dashboard', 'GET /dashboard');
  const q = get('/permissions?limit=20', 'GET /permissions');
  think();
  if (chance(0.6)) get('/dashboard/activity?limit=20', 'GET /dashboard/activity');
  if (chance(0.5)) get('/emergencies?status=open', 'GET /emergencies');
  const id = pickId(q, 'items');
  if (id && chance(0.5)) get(`/permissions/${id}`, 'GET /permissions/:id');
}

function admin() {
  get('/me', 'GET /me');
  get('/sites', 'GET /sites');
  appOpen();
  think();
  get('/dashboard', 'GET /dashboard');
  get('/dashboard/activity?limit=20', 'GET /dashboard/activity');
  get('/permissions?limit=20', 'GET /permissions');
  think();
  if (chance(0.5)) get('/roster?limit=20', 'GET /roster');
  if (chance(0.4)) get('/groups?limit=100', 'GET /groups');
  if (chance(0.4)) get('/profile-requests', 'GET /profile-requests');
  if (chance(0.3)) get('/announcements?limit=10', 'GET /announcements');
  if (chance(0.4)) get('/emergencies?status=open', 'GET /emergencies');
  if (chance(0.2)) {
    get('/roles', 'GET /roles');
    get('/memberships?limit=100', 'GET /memberships');
  }
}

const JOURNEYS = { student, parent, warden, admin };

export function runJourney(forceRole) {
  let role = forceRole;
  if (!role) {
    const x = Math.random();
    role = MIX.find((m) => x <= m.upto).role;
  }
  const pool = POOLS[role].length ? POOLS[role] : tokens;
  T = pool[Math.floor(Math.random() * pool.length)];
  JOURNEYS[T.role](T);
}

export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
  'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<2000'],
};
