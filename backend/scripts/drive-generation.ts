/**
 * QA drive: run PlansService.generateSessions locally with capture enabled,
 * without a server or auth. Pairs with `npm run eval:capture` for scoring.
 *
 * Usage (from backend/):
 *   npm run eval:drive -- <payload-or-capture.json> [label]
 *
 * Accepts either a bare GenerateSessionsDto payload or a prior capture file
 * (its `inputs` are replayed). Requires GROQ_API_KEY in backend/.env; writes
 * a capture under logs/generation-captures/ like a live request would.
 */
import * as fs from 'fs';
import * as path from 'path';

// Load backend/.env into process.env before requiring any service code.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) {
      const val = m[2]!.replace(/^["']|["']$/g, '');
      if (val && process.env[m[1]!] === undefined) process.env[m[1]!] = val;
    }
  }
}
process.env.GENERATION_CAPTURE = '1';

async function main(): Promise<void> {
  const src = process.argv[2];
  if (!src) {
    console.error(
      'Usage: npm run eval:drive -- <payload-or-capture.json> [label]',
    );
    process.exit(1);
  }
  const label = process.argv[3] ?? path.basename(src, '.json');
  const raw = JSON.parse(fs.readFileSync(path.resolve(src), 'utf8')) as Record<
    string,
    unknown
  >;
  const inputs = (raw.inputs ?? raw) as Record<string, unknown>;

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { ConfigService } = require('@nestjs/config');
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { ExercisesService } = require('../src/exercises/exercises.service');
  const {
    WorkoutGeneratorService,
  } = require('../src/workouts/workout-generator.service');
  const { PlansService } = require('../src/plans/plans.service');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const config = new ConfigService();
  const prisma = new PrismaService();
  const exercises = new ExercisesService();
  await exercises.onModuleInit();
  const generator = new WorkoutGeneratorService(config, exercises, prisma);
  const plans = new PlansService(prisma, generator, exercises, config);

  const capturesDir = path.join(__dirname, '..', 'logs', 'generation-captures');
  const before = new Set(
    fs.existsSync(capturesDir) ? fs.readdirSync(capturesDir) : [],
  );

  const t0 = Date.now();
  const result = await plans.generateSessions(inputs, 'qa-drive');
  const ms = Date.now() - t0;

  // Capture write is part of the same call; give the fs a beat then diff.
  await new Promise((r) => setTimeout(r, 500));
  const after = fs.existsSync(capturesDir) ? fs.readdirSync(capturesDir) : [];
  const created = after.filter((f) => !before.has(f));

  console.log(
    JSON.stringify(
      {
        label,
        ms,
        sessionCount: result.sessions.length,
        sessionNames: result.sessions.map(
          (s: { weekIndex: number; weekday: string; name: string }) =>
            `w${s.weekIndex} ${s.weekday}: ${s.name}`,
        ),
        newCaptures: created,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('drive failed:', err);
  process.exit(1);
});
