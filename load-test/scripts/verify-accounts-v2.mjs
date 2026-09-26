#!/usr/bin/env node
/**
 * Pre-flight for the Hostel v2 surface: POST /v2/auth/password/login for every
 * account in data/accounts.json, then one role-appropriate GET with the token.
 *
 *   BASE_URL=https://api.iverto.ai API_PREFIX=/devhostel TENANT_CODE=acme \
 *     node scripts/verify-accounts-v2.mjs
 *
 * Writes results/preflight-v2.json (per-account outcome + latencies, no tokens).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://api.iverto.ai').replace(/\/+$/, '');
const API_PREFIX = (process.env.API_PREFIX || '/devhostel').replace(/\/+$/, '');
const TENANT_CODE = process.env.TENANT_CODE || 'acme';
const V2 = `${BASE_URL}${API_PREFIX}/v2`;
const ACCOUNTS = resolve(HERE, '..', 'data', 'accounts.json');
const OUT = resolve(HERE, '..', 'results', 'preflight-v2.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);

const PROBE = {
  student: '/me/student',
  parent: '/me/children',
  warden: '/me',
  admin: '/me',
  security: '/me',
};

const accounts = JSON.parse(await readFile(ACCOUNTS, 'utf8'));
console.log(`Checking ${accounts.length} accounts against ${V2} (tenant ${TENANT_CODE}), concurrency ${CONCURRENCY}\n`);

const results = [];
let cursor = 0;

async function timed(url, init) {
  const t0 = performance.now();
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body, ms: Math.round(performance.now() - t0) };
}

async function worker() {
  while (cursor < accounts.length) {
    const acc = accounts[cursor++];
    const row = { role: acc.role, identifier: acc.identifier, csvStatus: acc.status ?? null };
    try {
      const l = await timed(`${V2}/auth/password/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: TENANT_CODE,
          identifier: acc.identifier,
          password: acc.password,
          clientType: 'tenant_mobile',
        }),
      });
      row.loginStatus = l.status;
      row.loginMs = l.ms;
      if (!l.body.accessToken) {
        row.outcome = 'LOGIN_FAIL';
        row.detail = l.body.detail || l.body.message || l.body.code || '';
      } else {
        row.actorType = l.body.user?.actorType;
        row.mfaEnrollmentRequired = l.body.user?.mfaEnrollmentRequired;
        const tenantId = l.body.user?.tenantId || TENANT_CODE;
        const p = await timed(`${V2}/tenants/${tenantId}${PROBE[acc.role] || '/me'}`, {
          headers: { Authorization: `Bearer ${l.body.accessToken}` },
        });
        row.probeStatus = p.status;
        row.probeMs = p.ms;
        row.outcome = p.status >= 200 && p.status < 300 ? 'OK' : 'READ_FAIL';
        if (row.outcome !== 'OK') row.detail = p.body.detail || p.body.title || '';
      }
    } catch (e) {
      row.outcome = 'ERROR';
      row.detail = String(e.message || e);
    }
    results.push(row);
    if (row.outcome !== 'OK') console.log(`  ${row.outcome.padEnd(10)} ${acc.role.padEnd(8)} ${acc.identifier}  ${row.loginStatus ?? ''}/${row.probeStatus ?? ''} ${row.detail ?? ''}`);
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const wall = (Date.now() - t0) / 1000;

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};
const summary = {};
for (const r of results) {
  const k = r.role;
  summary[k] ??= { total: 0, OK: 0, LOGIN_FAIL: 0, READ_FAIL: 0, ERROR: 0 };
  summary[k].total++;
  summary[k][r.outcome]++;
}
const loginMs = results.filter((r) => r.loginMs).map((r) => r.loginMs);
const probeMs = results.filter((r) => r.probeMs).map((r) => r.probeMs);
const stats = {
  wallSeconds: wall,
  loginP50: pct(loginMs, 50), loginP95: pct(loginMs, 95), loginMax: pct(loginMs, 100),
  probeP50: pct(probeMs, 50), probeP95: pct(probeMs, 95), probeMax: pct(probeMs, 100),
};
console.log('\n', summary, '\n', stats);
await writeFile(OUT, JSON.stringify({ target: V2, tenant: TENANT_CODE, at: new Date().toISOString(), summary, stats, results }, null, 1));
console.log(`\nwrote ${OUT}`);
