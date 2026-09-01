#!/usr/bin/env node
/**
 * Fails if any native library in an APK or AAB is not 16 KB page-size safe.
 *
 * Why this exists: a 4 KB-only build installs and runs perfectly on every 4 KB
 * device, so nothing in normal testing catches it. It only fails on a device
 * with 16 KB pages — which is what new Android 15+ hardware ships with — and
 * Google Play rejects it outright for anything targeting API 35 or above. That
 * combination is how a release gets all the way to the store before anyone
 * notices, which is exactly what happened on the Expo SDK 51 build: all 46 of
 * its libraries were 4 KB aligned and nothing said so.
 *
 * The test is on the ELF program headers: every PT_LOAD segment of every .so
 * needs p_align >= 16384. Prebuilt libraries inside dependency AARs are the
 * usual culprit, so this checks the packaged artifact rather than the sources —
 * it is the only place the real answer lives.
 *
 *   node scripts/check-16kb.mjs android/app/build/outputs/bundle/release/app-release.aab
 *   node scripts/check-16kb.mjs android/app/build/outputs/apk/release/*.apk
 *
 * Exits non-zero on the first artifact that fails, so it can gate a release.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const MIN_ALIGN = 16 * 1024;
const PT_LOAD = 1;

/**
 * Read a zip member without unpacking the archive. Node ships no zip reader, so
 * this shells out to the `unzip` that Git for Windows and every Unix already
 * provide; `-p` writes to stdout.
 */
function readEntry(archive, name) {
  return execFileSync('unzip', ['-p', archive, name], {
    maxBuffer: 512 * 1024 * 1024,
    encoding: 'buffer',
  });
}

function listEntries(archive) {
  const out = execFileSync('unzip', ['-Z1', archive], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Minimum p_align across the ELF's PT_LOAD segments, or null if not 64-bit ELF. */
function minLoadAlign(buf) {
  const isElf = buf.length > 64 && buf.readUInt32BE(0) === 0x7f454c46;
  if (!isElf || buf[4] !== 2) return null; // 2 = ELFCLASS64

  const phoff = Number(buf.readBigUInt64LE(0x20));
  const phentsize = buf.readUInt16LE(0x36);
  const phnum = buf.readUInt16LE(0x38);

  let min = Infinity;
  for (let i = 0; i < phnum; i += 1) {
    const off = phoff + i * phentsize;
    if (off + 0x38 > buf.length) break;
    if (buf.readUInt32LE(off) !== PT_LOAD) continue;
    min = Math.min(min, Number(buf.readBigUInt64LE(off + 0x30)));
  }
  return Number.isFinite(min) ? min : null;
}

const artifacts = process.argv.slice(2);
if (artifacts.length === 0) {
  console.error('usage: node scripts/check-16kb.mjs <apk-or-aab> [...]');
  process.exit(2);
}

let failed = false;

for (const artifact of artifacts) {
  if (!existsSync(artifact)) {
    console.error(`missing: ${artifact}`);
    failed = true;
    continue;
  }

  /* 64-bit only. A 32-bit library has no 16 KB requirement to meet — the page
     size rule applies to arm64 devices, which is where 16 KB pages exist. */
  const libs = listEntries(artifact).filter(
    (n) => n.endsWith('.so') && n.includes('arm64-v8a')
  );

  const bad = [];
  let checked = 0;

  for (const lib of libs) {
    const align = minLoadAlign(readEntry(artifact, lib));
    if (align == null) continue;
    checked += 1;
    if (align < MIN_ALIGN) bad.push([lib.split('/').pop(), align]);
  }

  const name = artifact.split(/[\\/]/).pop();
  if (checked === 0) {
    console.log(`?  ${name}: no arm64 libraries found`);
    continue;
  }
  if (bad.length > 0) {
    failed = true;
    console.log(`FAIL  ${name}: ${bad.length} of ${checked} libraries are not 16 KB safe`);
    for (const [lib, align] of bad.sort()) {
      console.log(`        ${lib} p_align=${align} (${align / 1024} KB)`);
    }
  } else {
    console.log(`OK    ${name}: all ${checked} arm64 libraries are 16 KB aligned`);
  }
}

process.exit(failed ? 1 : 0);
