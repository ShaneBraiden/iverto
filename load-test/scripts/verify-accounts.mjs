#!/usr/bin/env node
/**
 * Pre-flight check for the account pool.
 *
 *   node scripts/verify-accounts.mjs
 *   BASE_URL=https://api.iverto.ai API_PREFIX=/hostel node scripts/verify-accounts.mjs
 *
 * For every account in data/accounts.json it does POST /auth/login, then GET
 * /me with the token. Reports which fail and why. Writes data/tokens.json (one
 * token per account) for tools that want a ready token list.
 *
 * Node 18+ (built-in fetch). No dependencies.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://api.iverto.ai').replace(/\/+$/, '');
const API_PREFIX = (process.env.API_PREFIX || '/hostel').replace(/\/+$/, '');
const API = `${BASE_URL}${API_PREFIX}/v1/mobile`;
const ACCOUNTS = resolve(HERE, '..', 'data', 'accounts.json');
const TOKENS = resolve(HERE, '..', 'data', 'tokens.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);

const accounts = JSON.parse(await readFile(ACCOUNTS, 'utf8'));
console.log(`Checking ${accounts.length} accounts against ${API}\n`);

const results = [];
let cursor = 0;

async function worker() {
  while (cursor < accounts.length) {
    const acc = accounts[cursor++];
    const label = `${acc.role.padEnd(7)} ${acc.identifier}`;
    try {
      const body = { identifier: acc.identifier, password: acc.password };
      if (acc.role) body.role = acc.role;
      if (acc.tenantId) body.tenantId = acc.tenantId;

      const lr = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const lj = await lr.json().catch(() => ({}));
      if (!lr.ok || !lj.accessToken) {
        results.push({ label, ok: false, detail: `login ${lr.status} ${lj.message || lj.error || ''}` });
        console.log(`  FAIL  ${label}  — login ${lr.status}`);
        continue;
      }

      const mr = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${lj.accessToken}` } });
      if (!mr.ok) {
        results.push({ label, ok: false, detail: `GET /me ${mr.status}`, token: lj.accessToken });
        console.log(`  WARN  ${label}  — login ok but GET /me ${mr.status}`);
        continue;
      }

      results.push({ label, ok: true, token: lj.accessToken, identifier: acc.identifier, role: acc.role });
      console.log(`  ok    ${label}`);
    } catch (err) {
      results.push({ label, ok: false, detail: String(err) });
      console.log(`  ERROR ${label}  — ${err}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const good = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);

await writeFile(
  TOKENS,
  JSON.stringify(good.map(({ identifier, role, token }) => ({ identifier, role, token })), null, 2)
);

console.log(`\n${good.length} ok, ${bad.length} failed. Tokens -> ${TOKENS}`);
if (bad.length) {
  console.log('\nFailures:');
  for (const b of bad) console.log(`  ${b.label}: ${b.detail}`);
  process.exit(1);
}
