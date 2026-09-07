// Daily SQLite backup with rotation.
//
// Uses better-sqlite3's online backup API rather than copying the file: a
// plain `cp` while the app is mid-write can capture a torn database, and this
// is the only copy of the restaurant's financial records.
//
// Backups land OUTSIDE the app directory on purpose — a bad deploy, a
// `rsync --delete`, or an accidental `rm` inside /var/www must not be able to
// take the backups with it.
//
//   node scripts/backup-db.mjs [--db <path>] [--out <dir>] [--keep <n>]
//
// Run on a schedule by restaurantcrm-backup.timer (see deploy/).

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dbPath = resolve(arg("db", "/var/www/restaurantcrm/dev.db"));
const outDir = resolve(arg("out", "/var/backups/restaurantcrm"));
const keep = Number(arg("keep", "14"));

if (!existsSync(dbPath)) {
  console.error(`FAIL: database not found at ${dbPath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = join(outDir, `dev-${stamp}.db`);

const db = new Database(dbPath, { readonly: true });
try {
  await db.backup(target);
} finally {
  db.close();
}

// Verify the backup is actually readable and carries the rows we expect,
// rather than trusting that the file appeared. An unverified backup isn't one.
const check = new Database(target, { readonly: true });
let counts;
try {
  counts = {
    bills: check.prepare("SELECT COUNT(*) AS n FROM Bill").get().n,
    vendors: check.prepare("SELECT COUNT(*) AS n FROM Vendor").get().n,
    dailySales: check.prepare("SELECT COUNT(*) AS n FROM DailySales").get().n,
    users: check.prepare("SELECT COUNT(*) AS n FROM User").get().n,
  };
} catch (err) {
  console.error(`FAIL: backup at ${target} is not readable: ${err.message}`);
  process.exit(1);
} finally {
  check.close();
}

const sizeKb = Math.round(statSync(target).size / 1024);
console.log(`OK ${target} (${sizeKb} KB) — bills ${counts.bills}, vendors ${counts.vendors}, sales ${counts.dailySales}, users ${counts.users}`);

// Rotate: keep the newest N, delete the rest.
const existing = readdirSync(outDir)
  .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
  .map((f) => ({ f, mtime: statSync(join(outDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

for (const stale of existing.slice(keep)) {
  unlinkSync(join(outDir, stale.f));
  console.log(`rotated out ${stale.f}`);
}
console.log(`${Math.min(existing.length, keep)} backup(s) retained in ${outDir}`);
