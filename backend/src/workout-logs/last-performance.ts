import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared last-performance helpers over workout logs.
 *
 * Plain functions (no Nest provider) so both WorkoutLogsService and
 * WorkoutGeneratorService can use them without a WorkoutLogsModule <->
 * WorkoutsModule dependency cycle.
 */

export interface LastPerformedSet {
  setNumber: number;
  reps: number;
  /** Canonical pounds; null for bodyweight/unweighted sets. */
  weight: number | null;
}

export interface LastExercisePerformance {
  workoutLogId: string;
  performedAt: Date;
  /** Completed sets only, ordered by setNumber. Never empty. */
  sets: LastPerformedSet[];
}

/** Minimal log shape the reducer needs (prisma include entries -> completedSets). */
export interface LogWithEntries {
  id: string;
  startedAt: Date;
  entries: Array<{
    exerciseId: string | null;
    completedSets?: Array<{
      setNumber: number;
      reps: number;
      weight: number | null;
      completed: boolean;
    }> | null;
  }>;
}

/** How many recent logs to scan for last-performance lookups. */
export const RECENT_LOGS_WINDOW = 30;

const UNTRACKABLE_ID_PREFIX = /^(draft_|applied_|generated_)/i;

/**
 * True when the id is a real library exercise id that can be matched against
 * logged entries. Mirrors isLinkableLibraryExerciseId on the frontend; 'manual'
 * is the service-side fallback for entries logged without a library id.
 */
export function isTrackableExerciseId(
  id: string | null | undefined,
): id is string {
  if (!id) return false;
  if (id === 'manual') return false;
  return !UNTRACKABLE_ID_PREFIX.test(id);
}

/**
 * Walks logs newest-first and returns, per requested exercise id, the full
 * most-recent entry that has at least one completed set. Entries with no
 * completed sets fall through to older logs.
 */
export function pickLastEntriesForExercises(
  logs: LogWithEntries[],
  exerciseIds: string[],
): Map<string, LastExercisePerformance> {
  const idSet = new Set(exerciseIds);
  const result = new Map<string, LastExercisePerformance>();
  for (const log of logs) {
    for (const entry of log.entries) {
      if (
        !entry.exerciseId ||
        !idSet.has(entry.exerciseId) ||
        result.has(entry.exerciseId)
      ) {
        continue;
      }
      const sets = (entry.completedSets ?? [])
        .filter((s) => s.completed)
        .map((s) => ({
          setNumber: s.setNumber,
          reps: s.reps,
          weight: s.weight ?? null,
        }))
        .sort((a, b) => a.setNumber - b.setNumber);
      if (sets.length === 0) continue;
      result.set(entry.exerciseId, {
        workoutLogId: log.id,
        performedAt: log.startedAt,
        sets,
      });
    }
    if (result.size === idSet.size) break;
  }
  return result;
}

/**
 * Heaviest completed set (weight-less sets count as 0 lb; ties keep the
 * earlier set). Weight is omitted for bodyweight performances.
 */
export function bestCompletedSetByWeight(
  sets: LastPerformedSet[],
): { weight?: number; reps: number } | null {
  const best = sets.reduce<{ weight: number; reps: number } | null>(
    (acc, s) => {
      const w = s.weight ?? 0;
      if (!acc) return { weight: w, reps: s.reps };
      if (w > acc.weight) return { weight: w, reps: s.reps };
      return acc;
    },
    null,
  );
  if (!best) return null;
  return {
    weight: best.weight > 0 ? best.weight : undefined,
    reps: best.reps,
  };
}

/** Fetches the recent-log window for a user and reduces it per exercise id. */
export async function fetchLastEntriesForExercises(
  prisma: PrismaService,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, LastExercisePerformance>> {
  if (exerciseIds.length === 0) {
    return new Map();
  }
  const logs = await prisma.workoutLog.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: RECENT_LOGS_WINDOW,
    include: {
      entries: { include: { completedSets: true } },
    },
  });
  return pickLastEntriesForExercises(logs, exerciseIds);
}
