#!/usr/bin/env node
/**
 * Cancel outpasses created by a WRITE_MODE run.
 *
 *   RUN_TAG=loadtest-2026-09-07T21-00 node scripts/cleanup.mjs
 *   RUN_TAG=... node scripts/cleanup.mjs --dry-run
 *
 * Logs in as each write-ring student (`write: true` in data/accounts.json),
 * lists their permissions, and cancels any whose `reason` contains RUN_TAG and
 * whose status is still cancellable. Only touches the write-ring's own passes.
 *
 * It cannot undo a decision, a late entry, or a location ping — those are
 * one-way. Keep WRITE_MODE at `light` unless you have a dedicated test tenant.
 *
 * Node 18+. No dependencies.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://api.iverto.ai').replace(/\/+$/, '');
const API_PREFIX = (process.env.API_PREFIX || '/hostel').replace(/\/+$/, '');
const API = `${BASE_URL}${API_PREFIX}/v1/mobile`;
const RUN_TAG = process.env.RUN_TAG;
const DRY = process.argv.includes('--dry-run');

if (!RUN_TAG) {
  console.error('Set RUN_TAG to the tag the run used (see the k6 run output / your .env).');
  process.exit(2);
}

const accounts = JSON.parse(await readFile(resolve(HERE, '..', 'data', 'accounts.json'), 'utf8'));
const ring = accounts.filter((a) => a.write === true && a.role === 'student');
if (!ring.length) {
  console.error('No write-ring students (`"write": true`, `"role": "student"`) in accounts.json.');
  process.exit(2);
}

const CANCELLABLE = new Set(['pending', 'pending_warden', 'waiting_parent', 'escalated', 'approved']);
let scanned = 0;
let cancelled = 0;

for (const acc of ring) {
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
    console.log(`  skip ${acc.identifier}: login ${lr.status}`);
    continue;
  }
  const auth = { Authorization: `Bearer ${lj.accessToken}` };

  let cursor;
  do {
    const url = new URL(`${API}/permissions`);
    url.searchParams.set('status', 'all');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const pr = await fetch(url, { headers: auth });
    if (!pr.ok) {
      console.log(`  ${acc.identifier}: list ${pr.status}`);
      break;
    }
    const page = await pr.json();
    for (const p of page.data || []) {
      scanned++;
      const mine = typeof p.reason === 'string' && p.reason.includes(RUN_TAG);
      if (!mine) continue;
      if (!CANCELLABLE.has(p.status)) {
        console.log(`  leave ${p.id} (status ${p.status})`);
        continue;
      }
      if (DRY) {
        console.log(`  would cancel ${p.id} (${p.status})`);
        cancelled++;
        continue;
      }
      const cr = await fetch(`${API}/permissions/${p.id}/cancel`, { method: 'POST', headers: auth });
      console.log(`  cancel ${p.id}: ${cr.status}`);
      if (cr.ok) cancelled++;
    }
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
}

console.log(`\nScanned ${scanned} passes, ${DRY ? 'would cancel' : 'cancelled'} ${cancelled} tagged "${RUN_TAG}".`);
