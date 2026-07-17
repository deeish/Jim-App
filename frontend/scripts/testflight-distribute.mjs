/**
 * TestFlight tester distribution via the App Store Connect API — replaces the
 * manual "assign build to group" clicking in ASC after `eas submit`.
 *
 * Usage (from frontend/):
 *   npm run tf:groups                                   # list tester groups
 *   npm run tf:status                                   # recent builds + processing state
 *   npm run tf:distribute -- --group "Friends" --wait   # wait for the just-submitted build
 *   npm run tf:distribute -- --group "Friends" --build 12 [--wait]
 *
 * One-time setup (see docs/mobile-release.md):
 *   ASC → Users and Access → Integrations → Team Keys → Generate API Key
 *   (role: App Manager). Download the .p8 (only offered once), note the
 *   Key ID + Issuer ID, then set in frontend/.env:
 *     ASC_API_KEY_ID=XXXXXXXXXX
 *     ASC_API_ISSUER_ID=xxxxxxxx-xxxx-...
 *     ASC_API_KEY_PATH=./AuthKey_XXXXXXXXXX.p8   (gitignored via *.p8)
 *
 * No dependencies: the ES256 token is signed with Node's built-in WebCrypto.
 * Adding a build to an EXTERNAL group triggers Beta App Review automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com/v1';
const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- env ----------

function loadDotEnv() {
  const envPath = path.join(FRONTEND_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '');
      if (val && process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}

function requireConfig() {
  loadDotEnv();
  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID;
  const appId = process.env.ASC_APP_ID ?? '6776483293';
  const keyPath = path.resolve(
    FRONTEND_DIR,
    process.env.ASC_API_KEY_PATH ?? `AuthKey_${keyId ?? ''}.p8`,
  );
  const missing = [];
  if (!keyId) missing.push('ASC_API_KEY_ID');
  if (!issuerId) missing.push('ASC_API_ISSUER_ID');
  if (missing.length) {
    console.error(
      `Missing ${missing.join(' + ')} in frontend/.env.\n` +
        'One-time setup: App Store Connect → Users and Access → Integrations → ' +
        'Team Keys → Generate API Key (role: App Manager). See docs/mobile-release.md.',
    );
    process.exit(1);
  }
  if (!fs.existsSync(keyPath)) {
    console.error(
      `ASC key file not found: ${keyPath}\n` +
        'Download the .p8 when generating the key (offered once) and set ASC_API_KEY_PATH.',
    );
    process.exit(1);
  }
  return { keyId, issuerId, appId, keyPath };
}

// ---------- auth ----------

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function signToken({ keyId, issuerId, keyPath }) {
  const pem = fs.readFileSync(keyPath, 'utf8');
  const der = Buffer.from(
    pem.replace(/-----(BEGIN|END)[A-Z ]+-----/g, '').replace(/\s+/g, ''),
    'base64',
  );
  const key = await webcrypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }),
  );
  const sig = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

// ---------- api ----------

async function asc(token, method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) {
    console.error(
      'App Store Connect rejected the credentials (401). Check ASC_API_KEY_ID, ' +
        'ASC_API_ISSUER_ID, and that the .p8 matches the key id.',
    );
    process.exit(1);
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join('; ');
    throw new Error(`${method} ${url} → ${res.status}${detail ? ` (${detail})` : ''}`);
  }
  return json;
}

const fetchGroups = (token, appId) =>
  asc(
    token,
    'GET',
    `/betaGroups?filter[app]=${appId}&fields[betaGroups]=name,isInternalGroup&limit=50`,
  ).then((j) => j.data ?? []);

const fetchBuilds = (token, appId, { buildNumber, limit = 8 } = {}) =>
  asc(
    token,
    'GET',
    `/builds?filter[app]=${appId}` +
      (buildNumber ? `&filter[version]=${encodeURIComponent(buildNumber)}` : '') +
      `&sort=-uploadedDate&limit=${limit}` +
      '&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion' +
      '&include=preReleaseVersion&fields[preReleaseVersions]=version',
  );

function describeBuild(build, included) {
  const pre = (included ?? []).find(
    (x) =>
      x.type === 'preReleaseVersions' &&
      x.id === build.relationships?.preReleaseVersion?.data?.id,
  );
  const appVersion = pre?.attributes?.version ?? '?';
  const a = build.attributes;
  return `${appVersion} (${a.version})  ${a.processingState}${a.expired ? '  EXPIRED' : ''}  uploaded ${a.uploadedDate}`;
}

// ---------- commands ----------

async function cmdGroups(cfg) {
  const token = await signToken(cfg);
  const groups = await fetchGroups(token, cfg.appId);
  if (!groups.length) return console.log('No beta groups found for this app.');
  for (const g of groups) {
    console.log(
      `${g.attributes.name}  [${g.attributes.isInternalGroup ? 'internal' : 'external'}]  ${g.id}`,
    );
  }
}

async function cmdStatus(cfg) {
  const token = await signToken(cfg);
  const j = await fetchBuilds(token, cfg.appId);
  if (!j.data?.length) return console.log('No builds found.');
  for (const b of j.data) console.log(describeBuild(b, j.included));
}

async function cmdDistribute(cfg, args) {
  const groupNames = [];
  let buildNumber;
  let wait = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group') groupNames.push(args[++i]);
    else if (args[i] === '--build') buildNumber = args[++i];
    else if (args[i] === '--wait') wait = true;
  }
  if (!groupNames.length) {
    console.error(
      'Usage: npm run tf:distribute -- --group "<name>" [--group "<name2>"] [--build <number>] [--wait]',
    );
    process.exit(1);
  }

  let token = await signToken(cfg);
  const groups = await fetchGroups(token, cfg.appId);
  const targets = [];
  for (const name of groupNames) {
    const g = groups.find(
      (x) => x.attributes.name.toLowerCase() === name.toLowerCase(),
    );
    if (!g) {
      console.error(
        `No beta group named "${name}". Available: ${groups.map((x) => x.attributes.name).join(', ') || '(none)'}`,
      );
      process.exit(1);
    }
    targets.push(g);
  }

  // Right after `eas submit`, ASC can take several minutes to register the
  // new build at all — "latest" still points at the previous release (this is
  // how build 11 once got re-distributed instead of 12). With --wait we
  // therefore poll for the requested build number (or for a build newer than
  // the current latest) instead of silently taking what is already there.
  const deadline = Date.now() + 30 * 60 * 1000;
  const poll = async (message) => {
    if (Date.now() > deadline) {
      console.error('Timed out after 30 minutes waiting on App Store Connect.');
      process.exit(1);
    }
    console.log(`${message} — checking again in 30s`);
    await new Promise((r) => setTimeout(r, 30_000));
    token = await signToken(cfg); // ASC tokens expire mid-poll after 15 min
  };

  let j = await fetchBuilds(token, cfg.appId, { buildNumber, limit: 1 });
  let build = j.data?.[0];

  if (buildNumber) {
    while (!build) {
      if (!wait) {
        console.error(
          `No build ${buildNumber} found. Just-submitted builds take a few minutes to appear in ASC — re-run with --wait to poll for it.`,
        );
        process.exit(1);
      }
      await poll(`Build ${buildNumber} not registered in ASC yet`);
      j = await fetchBuilds(token, cfg.appId, { buildNumber, limit: 1 });
      build = j.data?.[0];
    }
  } else if (!build) {
    console.error('No builds found.');
    process.exit(1);
  } else if (wait && build.attributes.processingState !== 'PROCESSING') {
    // --wait without --build means "distribute the build I just submitted".
    // The latest build already finished processing, so it is the PREVIOUS
    // release — hold out for a newer upload to register.
    const baselineTime = Date.parse(build.attributes.uploadedDate);
    const baselineVersion = build.attributes.version;
    while (Date.parse(build.attributes.uploadedDate) <= baselineTime) {
      await poll(
        `Latest registered build is still ${baselineVersion} — waiting for the new upload (pass --build ${baselineVersion} if you meant that one)`,
      );
      j = await fetchBuilds(token, cfg.appId, { limit: 1 });
      build = j.data?.[0] ?? build;
    }
  }

  // TestFlight can only take builds that finished processing.
  while (build.attributes.processingState === 'PROCESSING') {
    if (!wait) {
      console.error(
        `Build ${describeBuild(build, j.included)}\nStill processing — re-run with --wait to poll until it is ready.`,
      );
      process.exit(1);
    }
    await poll(`Build ${build.attributes.version} is processing`);
    j = await fetchBuilds(token, cfg.appId, {
      buildNumber: build.attributes.version,
      limit: 1,
    });
    build = j.data?.[0] ?? build;
  }
  if (build.attributes.processingState !== 'VALID') {
    console.error(
      `Build is ${build.attributes.processingState} — it cannot be distributed. Check the build in App Store Connect.`,
    );
    process.exit(1);
  }
  if (build.attributes.expired) {
    console.error('That build is expired in TestFlight; upload a new one.');
    process.exit(1);
  }

  console.log(`Distributing ${describeBuild(build, j.included)}`);
  for (const g of targets) {
    await asc(token, 'POST', `/betaGroups/${g.id}/relationships/builds`, {
      data: [{ type: 'builds', id: build.id }],
    });
    const external = !g.attributes.isInternalGroup;
    console.log(
      `Added to "${g.attributes.name}"${external ? ' — external group: Apple runs Beta App Review before testers see it.' : ' — internal testers get it right away.'}`,
    );
  }
}

// ---------- main ----------

const [, , command, ...rest] = process.argv;
const cfg = requireConfig();
const run =
  command === 'groups'
    ? cmdGroups(cfg)
    : command === 'status'
      ? cmdStatus(cfg)
      : command === 'distribute'
        ? cmdDistribute(cfg, rest)
        : Promise.reject(
            new Error(`Unknown command "${command ?? ''}". Use: groups | status | distribute`),
          );

run.catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
