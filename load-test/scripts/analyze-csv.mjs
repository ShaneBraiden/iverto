#!/usr/bin/env node
/**
 * Per-endpoint and per-time-bucket stats from a k6 `--out csv=` file.
 *   node scripts/analyze-csv.mjs results/stress-v2.csv [bucketSeconds=30]
 * Writes <file>.analysis.json next to the input.
 */
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const file = process.argv[2];
const BUCKET = Number(process.argv[3] || 30);
const rl = createInterface({ input: createReadStream(file) });

let cols = null;
const ep = new Map();
const buckets = new Map();
let t0 = null;

for await (const line of rl) {
  if (!cols) {
    cols = Object.fromEntries(line.split(',').map((c, i) => [c, i]));
    continue;
  }
  const f = line.split(',');
  if (f[cols.metric_name] !== 'http_req_duration') continue;
  const ts = Number(f[cols.timestamp]);
  const v = Number(f[cols.metric_value]);
  const name = f[cols.name];
  const status = f[cols.status];
  const bad = !(Number(status) >= 200 && Number(status) < 300);
  if (t0 === null) t0 = ts;

  let e = ep.get(name);
  if (!e) ep.set(name, (e = { d: [], errors: 0, statuses: {} }));
  e.d.push(v);
  e.statuses[status] = (e.statuses[status] || 0) + 1;
  if (bad) e.errors++;

  const b = Math.floor((ts - t0) / BUCKET);
  let bk = buckets.get(b);
  if (!bk) buckets.set(b, (bk = { d: [], errors: 0, statuses: {} }));
  bk.d.push(v);
  if (bad) {
    bk.errors++;
    bk.statuses[status] = (bk.statuses[status] || 0) + 1;
  }
}

const pct = (s, p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
const summarise = (d) => {
  const s = Float64Array.from(d).sort();
  return { n: s.length, p50: Math.round(pct(s, 50)), p95: Math.round(pct(s, 95)), p99: Math.round(pct(s, 99)), max: Math.round(s[s.length - 1]) };
};

const endpoints = [...ep.entries()]
  .map(([name, e]) => ({ name, ...summarise(e.d), errors: e.errors, errRate: +(e.errors / e.d.length).toFixed(4), statuses: e.statuses }))
  .sort((a, b) => b.p95 - a.p95);
const timeline = [...buckets.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([b, k]) => ({ tStart: b * BUCKET, rps: +(k.d.length / BUCKET).toFixed(1), ...summarise(k.d), errRate: +(k.errors / k.d.length).toFixed(4), errStatuses: k.statuses }));

await writeFile(`${file}.analysis.json`, JSON.stringify({ endpoints, timeline }, null, 1));
console.log('ENDPOINTS (sorted by p95 ms)');
for (const e of endpoints) console.log(`  ${e.name.padEnd(42)} n=${String(e.n).padStart(6)} p50=${String(e.p50).padStart(6)} p95=${String(e.p95).padStart(6)} p99=${String(e.p99).padStart(6)} max=${String(e.max).padStart(6)} err=${(e.errRate * 100).toFixed(1)}% ${JSON.stringify(e.statuses)}`);
console.log(`\nTIMELINE (${BUCKET}s buckets)`);
for (const t of timeline) console.log(`  t=${String(t.tStart).padStart(4)}s rps=${String(t.rps).padStart(6)} p50=${String(t.p50).padStart(6)} p95=${String(t.p95).padStart(6)} p99=${String(t.p99).padStart(6)} err=${(t.errRate * 100).toFixed(1)}% ${JSON.stringify(t.errStatuses)}`);
