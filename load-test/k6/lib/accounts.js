/**
 * The account pool, loaded once per process and shared across all VUs.
 *
 * data/accounts.json is an array of:
 *   { "identifier": "24CS001", "password": "…", "role": "student",
 *     "tenantId": "", "write": false }
 *
 * `identifier` is whatever the login screen accepts for that role — roll
 * number, mobile number, or email. `role` only tells the server how to read
 * the identifier (see lib/api/endpoints.ts auth.login). `write: true` marks an
 * account in the dedicated write-ring (TEST-PLAN.md §8); everything else is
 * read-only however WRITE_MODE is set.
 */
import { SharedArray } from 'k6/data';
import { ACCOUNTS_FILE } from './config.js';

export const accounts = new SharedArray('accounts', function () {
  const list = JSON.parse(open(ACCOUNTS_FILE));
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${ACCOUNTS_FILE} has no accounts — see data/accounts.example.json`);
  }
  return list;
});

export const writeRing = accounts.filter((a) => a.write === true);

export function countByRole() {
  const c = {};
  for (const a of accounts) c[a.role] = (c[a.role] || 0) + 1;
  return c;
}

/**
 * Deterministic per-VU account. Each VU keeps the same account across
 * iterations, so a VU is one "person". If `role` is given and the pool has
 * accounts of that role, pick from those; otherwise fall back to the whole
 * pool.
 *
 * When VUs outnumber accounts of a role, accounts get shared — that invites
 * per-account rate limits (the API throttles decisions to 1/5s, emergencies to
 * 1/30s). Seed enough accounts. RUNBOOK.md §2 has the sizing.
 */
export function accountForVU(role) {
  let pool = accounts;
  if (role) {
    const filtered = accounts.filter((a) => a.role === role);
    if (filtered.length) pool = filtered;
  }
  return pool[(__VU - 1) % pool.length];
}
