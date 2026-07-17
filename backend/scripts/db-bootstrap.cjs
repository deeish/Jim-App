#!/usr/bin/env node
/**
 * Bootstrap an EMPTY database to the current schema and baseline migration history.
 *
 * Why this exists: the migration history was baselined against a live database
 * (20260101000000_baseline is a no-op, and February's ALTER migrations sort before
 * 20260406120000_init, which actually creates the tables), so `prisma migrate deploy`
 * fails on a fresh database with "relation ... does not exist". This script pushes the
 * current schema directly, then marks every committed migration as applied so
 * `migrate deploy` works normally from then on.
 *
 * Usage:
 *   DATABASE_URL (and optionally DIRECT_URL) -> the TARGET database, then:
 *   npm run db:bootstrap
 *
 * Safety: refuses non-localhost hosts unless DB_BOOTSTRAP_ALLOW_REMOTE=1, so a stale
 * .env pointing at production cannot be bootstrapped by accident.
 */

const { execFileSync } = require('child_process');
const { readdirSync } = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. Point it at the EMPTY target database first.');
  process.exit(1);
}

let host = '(unparseable)';
try {
  host = new URL(url).hostname;
} catch {
  /* keep placeholder; the guard below will refuse it */
}

const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!isLocal && process.env.DB_BOOTSTRAP_ALLOW_REMOTE !== '1') {
  console.error(
    `Refusing to bootstrap non-local host "${host}". This command is for EMPTY databases; ` +
      'if that is truly what you are pointing at, re-run with DB_BOOTSTRAP_ALLOW_REMOTE=1.',
  );
  process.exit(1);
}

// Prisma CLI resolves schema.prisma's directUrl; default it so callers only set one var.
if (!process.env.DIRECT_URL) process.env.DIRECT_URL = url;

const prisma = (...args) =>
  execFileSync('npx', ['prisma', ...args], {
    stdio: 'inherit',
    cwd: backendDir,
    shell: process.platform === 'win32', // npx is npx.cmd on Windows
  });

console.log(`Bootstrapping database at ${host} ...`);
prisma('db', 'push', '--skip-generate');

const migrationsDir = path.join(backendDir, 'prisma', 'migrations');
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of migrations) {
  prisma('migrate', 'resolve', '--applied', name);
}

prisma('migrate', 'status');
console.log(`Done: schema pushed and ${migrations.length} migrations baselined as applied.`);
