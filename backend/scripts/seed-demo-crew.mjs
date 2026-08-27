/**
 * Put four demo crewmates in ONE account's crew, so the Crew tab has people in
 * it for a walkthrough, a screenshot, or a TestFlight demo.
 *
 * These are plain `users` rows with no auth identity — nobody can sign in as
 * them, they never receive anything, and they exist only to render. Every row
 * this script writes is keyed to the DEMO_PREFIX below, which is also the only
 * thing `--undo` will delete: it can never touch a real account's data.
 *
 *   node scripts/seed-demo-crew.mjs --owner you@example.com            # dry run
 *   node scripts/seed-demo-crew.mjs --owner you@example.com --apply
 *   node scripts/seed-demo-crew.mjs --owner you@example.com --apply --backdate-crew 20
 *   node scripts/seed-demo-crew.mjs --owner you@example.com --undo --apply
 *
 * DATABASE_URL must be set INLINE on the command (PowerShell env does not
 * persist between calls, and a bare run falls back to backend/.env — which
 * points at production). The script prints the host it resolved before it
 * writes anything; read that line.
 *
 * A crew holds 10, so four demo mates leave six seats. When real friends
 * arrive, run --undo and they are gone with their sessions.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Every demo row's id starts with this. `--undo` deletes exactly these. */
const DEMO_PREFIX = 'de70de70';
const demoId = (n) => `${DEMO_PREFIX}-0000-4000-8000-00000000000${n}`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const APPLY = flag('apply');
const UNDO = flag('undo');
const OWNER = value('owner');
const CREW_NAME = value('crew-name') ?? 'Demo Crew';
/**
 * Age a crew you ALREADY have, in days. Opt-in and explicit, because the crew
 * streak floors at the crew's creation date: a crew made ten minutes ago can
 * only ever read "Start the crew streak", however much history its members
 * have. Worth it for a demo crew, never something to do silently to a real one.
 */
const BACKDATE = Number(value('backdate-crew') ?? 0);

// ---- the week ---------------------------------------------------------------
const now = new Date();
const T = (now.getDay() + 6) % 7; // 0 = Monday
const monday = new Date(now);
monday.setDate(now.getDate() - T);
const dayOf = (i) => {
  const d = new Date(monday);
  d.setDate(monday.getDate() + i);
  return d;
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const isoOf = (i) => {
  const d = dayOf(i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Noon local, so a session stays on its own calendar day under any tz. */
const at = (i, hour = 12) => {
  const d = dayOf(i);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const inWeek = (i) => i >= 0 && i <= 6;

const EX = {
  chest: { id: 'flat_barbell_bench_press', name: 'Flat Barbell Bench Press' },
  back: { id: 'barbell_bent_over_row', name: 'Barbell Bent-Over Row' },
  legs: { id: 'trap_bar_deadlift', name: 'Trap Bar Deadlift' },
  shoulders: { id: 'face_pull', name: 'Face Pull' },
};

// Four people at four different points in their week, so every row state the
// tab can render is on screen at once: done-for-the-week, mid-week, scheduled
// today but not trained yet, and nothing logged.
const CREW = [
  {
    n: 1, name: 'Ava Romero', avatarId: 'crimson',
    slots: [[0, 'back', 'Pull Day'], [T - 1, 'legs', 'Leg Day'], [T, 'chest', 'Push Day']],
    logs: [[0, 'back', 'Pull Day'], [T - 1, 'legs', 'Leg Day'], [T, 'chest', 'Push Day']],
    pr: true,
  },
  {
    n: 2, name: 'Marcus Hale', avatarId: 'runner',
    slots: [[0, 'legs', 'Leg Day'], [T, 'back', 'Pull Day'], [T + 2, 'shoulders', 'Shoulder Day']],
    logs: [[0, 'legs', 'Leg Day'], [T, 'back', 'Pull Day']],
  },
  {
    n: 3, name: 'Priya Nair', avatarId: 'trophy',
    slots: [[0, 'chest', 'Push Day'], [T, 'legs', 'Leg Day'], [T + 2, 'shoulders', 'Shoulder Day']],
    logs: [[0, 'chest', 'Push Day']],
  },
  {
    // avatarIds must be real PROFILE_AVATARS ids, not their display names —
    // getProfileAvatar() silently falls back to the default blue otherwise.
    n: 4, name: 'Jonah Reyes', avatarId: 'cyclist',
    slots: [[T + 1, 'legs', 'Leg Day'], [T + 2, 'back', 'Pull Day']],
    logs: [],
  },
];

const ids = CREW.map((p) => demoId(p.n));

function dbHost() {
  const url = process.env.DATABASE_URL ?? '';
  try {
    return new URL(url).host || '(unparsed)';
  } catch {
    return url ? '(unparsed)' : '(unset — will fall back to backend/.env, i.e. PRODUCTION)';
  }
}

async function undo() {
  // Order matters: WorkoutPlan.userId is SetNull, so deleting the user first
  // would orphan plans instead of removing them.
  const where = { userId: { in: ids } };
  const logs = await prisma.workoutLog.deleteMany({ where });
  const workouts = await prisma.workout.deleteMany({ where });
  const plans = await prisma.workoutPlan.deleteMany({ where });
  const members = await prisma.crewMember.deleteMany({ where });
  const users = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(
    `removed: ${users.count} demo users, ${members.count} memberships, ` +
      `${plans.count} plans, ${workouts.count} workouts, ${logs.count} logs ` +
      `(kudos cascade with the user)`,
  );
}

async function seed() {
  const owner = await prisma.user.findFirst({
    where: OWNER.includes('@') ? { email: OWNER } : { id: OWNER },
    include: { crewMembership: true },
  });
  if (!owner) throw new Error(`no account matches --owner ${OWNER}`);

  let crewId = owner.crewMembership?.crewId ?? null;
  if (crewId) {
    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    console.log(`joining ${owner.name ?? owner.email}'s existing crew "${crew?.name ?? 'Your crew'}" (${crew?.code})`);
    if (BACKDATE > 0) {
      const born = new Date(now);
      born.setDate(now.getDate() - BACKDATE);
      await prisma.crew.update({ where: { id: crewId }, data: { createdAt: born } });
      console.log(`  aged that crew to ${BACKDATE} days old so the streak has room to count`);
    }
  } else {
    const code = Array.from({ length: 8 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
    ).join('');
    // The crew streak floors at the crew's creation date, so a crew born a
    // second ago can only ever read "Start the crew streak". Backdated ONLY
    // for a crew this script creates — never for one you already had.
    const born = new Date(now);
    born.setDate(now.getDate() - 20);
    const crew = await prisma.crew.create({ data: { code, name: CREW_NAME, createdAt: born } });
    await prisma.crewMember.create({ data: { crewId: crew.id, userId: owner.id } });
    crewId = crew.id;
    console.log(`created crew "${CREW_NAME}" (${code}) with ${owner.name ?? owner.email} in it`);
  }

  // Demo mates must join AFTER the owner, never before. The crew lead — the
  // only member who can remove people or mint a new code — is whoever has
  // been in the crew longest, so backdating these rows past the owner's own
  // joinedAt would hand your crew to a fake person.
  //
  // Joining "now" costs the streak nothing: a member cannot violate days from
  // before they joined, so their earlier sessions still count and their
  // earlier rest days cannot break anything.
  const ownerJoinedAt = owner.crewMembership?.joinedAt ?? new Date(now);
  const joined = new Date(ownerJoinedAt.getTime() + 60_000);

  for (const p of CREW) {
    const id = demoId(p.n);
    await prisma.user.upsert({
      where: { id },
      update: { name: p.name, avatarId: p.avatarId },
      create: { id, name: p.name, avatarId: p.avatarId, email: `demo+${p.n}@jim.invalid` },
    });
    await prisma.crewMember.upsert({
      where: { userId: id },
      update: { crewId, joinedAt: joined },
      create: { crewId, userId: id, joinedAt: joined },
    });

    // Re-runnable: clear this demo user's own history, never anyone else's.
    await prisma.workoutLog.deleteMany({ where: { userId: id } });
    await prisma.workout.deleteMany({ where: { userId: id } });
    await prisma.workoutPlan.deleteMany({ where: { userId: id } });

    const plan = await prisma.workoutPlan.create({
      data: {
        userId: id,
        name: `${p.name.split(' ')[0]}'s plan`,
        isActive: true,
        weekAnchorMonday: new Date(`${isoOf(0)}T00:00:00.000Z`),
      },
    });
    for (const [i, group, title] of p.slots) {
      if (!inWeek(i)) continue;
      const ex = EX[group];
      await prisma.planWorkout.create({
        data: {
          workoutPlanId: plan.id,
          weekNumber: 1,
          dayOfWeek: DAY_NAMES[i],
          title,
          type: 'strength',
          durationMinutes: 55,
          exercises: { create: [{ exerciseId: ex.id, name: ex.name, sets: 4, reps: 8, orderIndex: 0 }] },
        },
      });
    }
    for (const [i, group, title] of p.logs) {
      if (!inWeek(i)) continue;
      const ex = EX[group];
      const workout = await prisma.workout.create({
        data: { userId: id, name: title, workoutPlanId: plan.id },
      });
      const weight = p.pr && i === T ? 225 : 155;
      await prisma.workoutLog.create({
        data: {
          userId: id,
          workoutId: workout.id,
          startedAt: at(i),
          completedAt: at(i, 13),
          entries: {
            create: [
              {
                exerciseId: ex.id,
                name: ex.name,
                orderIndex: 0,
                completedSets: {
                  create: [
                    { setNumber: 1, reps: 8, weight, completed: true },
                    { setNumber: 2, reps: 6, weight, completed: true },
                  ],
                },
              },
            ],
          },
        },
      });
    }
    // A record needs a lighter lift from BEFORE this week to beat.
    if (p.pr) {
      const workout = await prisma.workout.create({
        data: { userId: id, name: 'Push Day', workoutPlanId: plan.id },
      });
      await prisma.workoutLog.create({
        data: {
          userId: id,
          workoutId: workout.id,
          startedAt: at(T - 7),
          completedAt: at(T - 7, 13),
          entries: {
            create: [
              {
                exerciseId: EX.chest.id,
                name: EX.chest.name,
                orderIndex: 0,
                completedSets: { create: [{ setNumber: 1, reps: 5, weight: 205, completed: true }] },
              },
            ],
          },
        },
      });
    }
  }

  // Pounds BETWEEN demo mates only, so the counts on screen are not claims
  // that anyone real cheered anything.
  const prRef = `pr:${isoOf(T)}:${EX.chest.id}`;
  await prisma.crewKudos.createMany({
    data: [
      { crewId, fromUserId: demoId(2), toUserId: demoId(1), eventRef: prRef },
      { crewId, fromUserId: demoId(3), toUserId: demoId(1), eventRef: prRef },
      { crewId, fromUserId: demoId(1), toUserId: demoId(2), eventRef: `day:${isoOf(T)}` },
    ],
    skipDuplicates: true,
  });

  console.log(`seeded ${CREW.length} demo crewmates: ${CREW.map((p) => p.name.split(' ')[0]).join(', ')}`);
}

async function main() {
  if (!OWNER && !UNDO) {
    console.error('usage: node scripts/seed-demo-crew.mjs --owner <email|userId> [--apply] [--undo]');
    process.exit(1);
  }
  console.log(`database: ${dbHost()}`);
  console.log(`mode: ${UNDO ? 'UNDO' : 'SEED'}${APPLY ? ' (writing)' : ' (dry run — pass --apply to write)'}`);
  console.log(`demo ids: ${DEMO_PREFIX}-... x${ids.length}`);
  if (!APPLY) {
    console.log(
      UNDO
        ? 'would delete only the demo ids above and everything they own.'
        : `would add ${CREW.map((p) => p.name).join(', ')} to ${OWNER}'s crew, each with this week's plan and sessions.`,
    );
    return;
  }
  if (UNDO) await undo();
  else await seed();
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
