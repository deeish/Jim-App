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
 * On Windows `npm run ... -- --flag` mangles the extra flags; call this file
 * directly instead: node scripts/testflight-distribute.mjs distribute --group ...
 *
 * Only EXTERNAL groups are ever assigned a build. Internal groups are reported
 * and skipped: App Store Connect hands internal testers every processed build
 * automatically and returns HTTP 422 if you try to assign one explicitly.
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
 *
 * Adding a build to an EXTERNAL group does NOT start Beta App Review by
 * itself — the build sits at READY_FOR_BETA_SUBMISSION until a separate
 * review submission is created (build 18 sat unreviewed until a manual POST).
 * After assigning external groups, the script therefore also submits the
 * build for Beta App Review when it still needs one.
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
      '&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion,buildBetaDetail' +
      '&include=preReleaseVersion,buildBetaDetail' +
      '&fields[preReleaseVersions]=version&fields[buildBetaDetails]=externalBuildState',
  );

/**
 * Where the build stands with EXTERNAL testers, e.g. READY_FOR_BETA_SUBMISSION
 * (in a group but review never requested), WAITING_FOR_BETA_REVIEW,
 * IN_BETA_REVIEW, BETA_APPROVED, BETA_REJECTED, IN_BETA_TESTING. This is the
 * only trustworthy signal: GET /builds/{id}/betaGroups returns "(none)" even
 * for builds that were definitely distributed.
 */
const fetchExternalBuildState = (token, buildId) =>
  asc(
    token,
    'GET',
    `/builds/${buildId}/buildBetaDetail?fields[buildBetaDetails]=externalBuildState`,
  ).then((j) => j?.data?.attributes?.externalBuildState);

/** Rough "how long ago was this uploaded", for messages about build recency. */
function describeAge(build) {
  const mins = Math.round((Date.now() - Date.parse(build.attributes.uploadedDate)) / 60_000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function describeBuild(build, included) {
  const rel = (name, type) =>
    (included ?? []).find(
      (x) => x.type === type && x.id === build.relationships?.[name]?.data?.id,
    );
  const appVersion =
    rel('preReleaseVersion', 'preReleaseVersions')?.attributes?.version ?? '?';
  const external = rel('buildBetaDetail', 'buildBetaDetails')?.attributes
    ?.externalBuildState;
  const a = build.attributes;
  return `${appVersion} (${a.version})  ${a.processingState}${a.expired ? '  EXPIRED' : ''}${external ? `  external: ${external}` : ''}  uploaded ${a.uploadedDate}`;
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
  // How recently a build must have been uploaded to count as "the one I just
  // submitted" when no --build is given. See the resolution comment below.
  let recentMinutes = 45;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group') groupNames.push(args[++i]);
    else if (args[i] === '--build') buildNumber = args[++i];
    else if (args[i] === '--wait') wait = true;
    else if (args[i] === '--recent-minutes') recentMinutes = Number(args[++i]);
  }
  if (!groupNames.length || !Number.isFinite(recentMinutes) || recentMinutes <= 0) {
    console.error(
      'Usage: node scripts/testflight-distribute.mjs distribute --group "<name>" ' +
        '[--group "<name2>"] [--build <number>] [--wait] [--recent-minutes <n>]',
    );
    process.exit(1);
  }
  const recentWindowMs = recentMinutes * 60_000;

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

  // Resolving "the build I just submitted" is the whole difficulty here, and
  // both of the ways this has gone wrong were timing races:
  //
  //   build 12 — ASC had not registered the new upload yet, so "latest" was
  //              still build 11 from days earlier, and 11 got re-distributed.
  //   build 14 — Apple processed the upload within a couple of minutes, so by
  //              the time this ran, "latest" already WAS the new build. The
  //              then-current fix waited for something newer than it, which
  //              never came, and it timed out after 30 minutes.
  //
  // Waiting for "a build newer than whatever was latest at startup" cannot
  // distinguish those two, because it depends on who wins the race with Apple.
  // Recency can: the build you just submitted is, by definition, uploaded
  // moments ago. So --wait now polls until the newest upload is inside the
  // recency window, which keeps waiting in the build-12 case and returns
  // immediately in the build-14 case. --build <n> always wins over all of this.
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
  } else {
    // No --build: take the newest upload, but only once it is recent enough to
    // plausibly be the one just submitted (see the comment above the poller).
    const isRecent = (b) =>
      b && Date.now() - Date.parse(b.attributes.uploadedDate) <= recentWindowMs;
    while (!isRecent(build)) {
      if (!wait) {
        console.error(
          build
            ? `Newest upload is build ${build.attributes.version}, from ${describeAge(build)} ago — too old to be a build you just submitted.\n` +
                `Re-run with --wait to poll for the new upload, or --build ${build.attributes.version} to distribute that one deliberately.`
            : 'No builds found.',
        );
        process.exit(1);
      }
      await poll(
        build
          ? `Newest upload is still build ${build.attributes.version} from ${describeAge(build)} ago — waiting for the new one to register`
          : 'No builds registered in App Store Connect yet',
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

  // App Store Connect makes every processed build available to internal testers
  // on its own, and REJECTS an explicit assignment with HTTP 422 ("Cannot add
  // internal group to a build"). So an internal group is never something to
  // POST — reaching VALID, which we just confirmed above, is the whole job.
  const internalGroups = targets.filter((g) => g.attributes.isInternalGroup);
  const externalGroups = targets.filter((g) => !g.attributes.isInternalGroup);

  for (const g of internalGroups) {
    console.log(
      `"${g.attributes.name}" is an internal group — App Store Connect gives internal ` +
        `testers every processed build automatically, so there is nothing to assign. ` +
        `Build ${build.attributes.version} is VALID and available to them now.`,
    );
  }

  if (!externalGroups.length) return;

  console.log(`Distributing ${describeBuild(build, j.included)}`);
  for (const g of externalGroups) {
    await asc(token, 'POST', `/betaGroups/${g.id}/relationships/builds`, {
      data: [{ type: 'builds', id: build.id }],
    });
    console.log(`Added to "${g.attributes.name}" (external group).`);
  }

  // Group membership alone does NOT put the build in front of external
  // testers: it stays at READY_FOR_BETA_SUBMISSION until a Beta App Review
  // submission exists (build 18 sat that way until one was POSTed by hand).
  // So finish the job here, but only when the build actually needs it — a
  // build already in or past review must not be re-submitted.
  const state = await fetchExternalBuildState(token, build.id);
  if (state === 'READY_FOR_BETA_SUBMISSION') {
    await asc(token, 'POST', '/betaAppReviewSubmissions', {
      data: {
        type: 'betaAppReviewSubmissions',
        relationships: { build: { data: { type: 'builds', id: build.id } } },
      },
    });
    const after = await fetchExternalBuildState(token, build.id);
    console.log(
      `Submitted build ${build.attributes.version} for Beta App Review` +
        `${after ? ` — externalBuildState is now ${after}` : ''}. External testers get it once Apple approves.`,
    );
  } else if (state === 'WAITING_FOR_BETA_REVIEW' || state === 'IN_BETA_REVIEW') {
    console.log(
      `Beta App Review already underway (externalBuildState ${state}) — nothing to submit.`,
    );
  } else if (
    state === 'BETA_APPROVED' ||
    state === 'READY_FOR_BETA_TESTING' ||
    state === 'IN_BETA_TESTING'
  ) {
    console.log(
      `Build already cleared Beta App Review (externalBuildState ${state}) — external testers can install it now.`,
    );
  } else {
    console.error(
      `Build was added to the group(s) but NOT submitted for Beta App Review: ` +
        `externalBuildState is ${state ?? 'unknown'}${
          state === 'BETA_REJECTED'
            ? ' — Apple rejected this build; resolve the rejection in App Store Connect.'
            : ' — check the build in App Store Connect.'
        }`,
    );
    process.exitCode = 1;
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
