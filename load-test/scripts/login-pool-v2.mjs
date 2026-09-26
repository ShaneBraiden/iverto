#!/usr/bin/env node
/**
 * Builds data/tokens.json for the v2 k6 scripts by logging in a sample of
 * accounts from data/accounts.json, paced under the public-auth rate limit
 * (~10 logins/min/IP observed, Retry-After: 60). Access tokens live ~15 min,
 * so run the k6 script straight after.
 *
 *   POOL=student:24,parent:8,warden:3,admin:2 PACE_MS=6500 node scripts/login-pool-v2.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://api.iverto.ai').replace(/\/+$/, '');
const API_PREFIX = (process.env.API_PREFIX || '/devhostel').replace(/\/+$/, '');
const TENANT_CODE = process.env.TENANT_CODE || 'acme';
const V2 = `${BASE_URL}${API_PREFIX}/v2`;
const PACE_MS = Number(process.env.PACE_MS || 6500);
const SKIP = new Set((process.env.SKIP || 'student.acm0001@acme.edu').split(','));
const POOL = Object.fromEntries(
  (process.env.POOL || 'student:24,parent:8,warden:3,admin:2').split(',').map((p) => {
    const [r, n] = p.split(':');
    return [r, Number(n)];
  })
);

const accounts = JSON.parse(await readFile(resolve(HERE, '..', 'data', 'accounts.json'), 'utf8'));
const pick = [];
for (const [role, n] of Object.entries(POOL)) {
  const eligible = accounts.filter(
    (a) => a.role === role && !SKIP.has(a.identifier) && (a.status == null || a.status === 'active') &&
      (role !== 'parent' || a.identifier.startsWith('parent.acm'))
  );
  pick.push(...eligible.slice(0, n));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`Logging in ${pick.length} accounts at one per ${PACE_MS}ms (~${Math.ceil((pick.length * PACE_MS) / 60000)} min)`);

const out = [];
let throttled = 0;
for (const acc of pick) {
  for (;;) {
    const r = await fetch(`${V2}/auth/password/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantCode: TENANT_CODE, identifier: acc.identifier, password: acc.password, clientType: 'tenant_mobile' }),
    });
    if (r.status === 429) {
      throttled++;
      const wait = Number(r.headers.get('retry-after') || 60) * 1000;
      console.log(`  429 on ${acc.identifier}, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (j.accessToken) {
      out.push({ role: acc.role, identifier: acc.identifier, tenantId: j.user?.tenantId || TENANT_CODE, accessToken: j.accessToken, refreshToken: j.refreshToken, accessExpiresAt: j.accessExpiresAt });
      console.log(`  ok   ${acc.role.padEnd(7)} ${acc.identifier}`);
    } else {
      console.log(`  FAIL ${acc.role.padEnd(7)} ${acc.identifier} ${r.status} ${j.detail || ''}`);
    }
    break;
  }
  await sleep(PACE_MS);
}
await writeFile(resolve(HERE, '..', 'data', 'tokens.json'), JSON.stringify(out, null, 1));
const c = {};
for (const t of out) c[t.role] = (c[t.role] || 0) + 1;
console.log(`\nwrote data/tokens.json`, c, `429s hit: ${throttled}`, `earliest expiry: ${out.map((t) => t.accessExpiresAt).sort()[0]}`);
