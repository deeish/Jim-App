import type { WeekProgressionDto } from './dto/generate-sessions.dto';

/**
 * The block's shape as the rules apply it, whatever profile the client sent.
 *
 * Reps hold across a build: the load moves, not the rep band. Effort tightens
 * once, at the halfway point of the build weeks. A deload eases both. The
 * client profile used to cut reps every week (0, −1, −2, −3 across a
 * four-week build), which drifted a muscle block from 8–12 to 5–9 by week
 * four, and the phase rule sent week 2 to one rep in reserve before a single
 * week-1 set had been logged (rig runs 2026-09-17). A coach writes the same
 * reps with a little more weight, and only asks for a harder week once the
 * first weeks are in the log; the post-session check-in
 * (checkin-adjustment.ts) moves the load from there.
 */
export type NormalizedWeekProgression = WeekProgressionDto & {
  /** Added to every row's target reps in reserve (negative = harder). */
  rirShift: number;
  /** Multiplies a history-derived load; 1 on the first build week. */
  loadFactor: number;
};

/** A build week adds this much load over the previous one, before rounding to a plate. */
export const LOAD_STEP_PER_BUILD_WEEK = 0.025;
/** A deload trains at this share of the first build week's load. */
export const DELOAD_LOAD_FACTOR = 0.9;
/** A deload adds this many reps in reserve. */
export const DELOAD_RIR_SHIFT = 2;

const BUILD_PHASES = new Set(['foundation', 'progression', 'peak']);

function phaseOf(p: WeekProgressionDto): string {
  return (p.phase ?? '').toLowerCase().trim();
}

export function isBuildPhase(phase: string | undefined): boolean {
  return BUILD_PHASES.has((phase ?? '').toLowerCase().trim());
}

export function normalizeWeekProgression(
  list: WeekProgressionDto[] | undefined,
): NormalizedWeekProgression[] {
  if (!list?.length) return [];
  const sorted = [...list].sort((a, b) => a.weekIndex - b.weekIndex);
  const buildWeeks = sorted.filter((p) => isBuildPhase(p.phase));
  const firstHalf = Math.ceil(buildWeeks.length / 2);
  return sorted.map((p) => {
    const phase = phaseOf(p);
    if (phase === 'deload') {
      return {
        ...p,
        repModifier: Math.max(0, p.repModifier),
        rirShift: DELOAD_RIR_SHIFT,
        loadFactor: DELOAD_LOAD_FACTOR,
      };
    }
    if (!isBuildPhase(phase)) {
      return { ...p, repModifier: 0, rirShift: 0, loadFactor: 1 };
    }
    const position = buildWeeks.indexOf(p);
    return {
      ...p,
      repModifier: 0,
      rirShift: position < firstHalf ? 0 : -1,
      loadFactor: 1 + LOAD_STEP_PER_BUILD_WEEK * position,
    };
  });
}

/** Per-week load factor lookup, 1 for weeks the profile does not name. */
export function loadFactorByWeek(
  list: WeekProgressionDto[] | undefined,
): (weekIndex: number) => number {
  const byWeek = new Map(
    normalizeWeekProgression(list).map((p) => [p.weekIndex, p.loadFactor]),
  );
  return (weekIndex) => byWeek.get(weekIndex) ?? 1;
}
