/**
 * Human-readable lines for Plan Preview — matches what drives POST /plans/generate-sessions
 * (PlanInputs → buildGenerateSessionsRequest), not legacy route `inputs`.
 */

import type { CoachCheckReport, PlanInputs, Weekday } from '../types/plan';

/** Matches server `GenerateSessionsDto.mesoHint` max length. */
export const MESO_HINT_MAX_LENGTH = 200;

export interface WeekProgressionEntry {
  weekIndex: number;
  /** 'foundation' | 'progression' | 'peak' | 'deload' | 'maintain' */
  phase: string;
  /** Approximate % of working max, e.g. 65, 70, 75, 60 */
  intensityPct: number;
  /** Set volume multiplier vs baseline: 1.0 = normal, 1.15 = +15%, 0.7 = deload */
  volumeMultiplier: number;
  /** Rep modifier vs base scheme: 0 = same, -1 = fewer reps (heavier), +2 = more reps (lighter) */
  repModifier: number;
}

/**
 * Computes per-week intensity/volume targets from the user's progression style.
 * Sent to the backend as `weekProgression`. Reps hold across a build (the load
 * moves, not the rep band; the server's progression-profile.ts enforces the
 * same shape for older clients); only a deload lightens the reps.
 */
export function weekProgressionForGenerateSessions(
  inputs: PlanInputs,
  weekIndices: number[],
): WeekProgressionEntry[] {
  const ps = inputs.progressionStyle;
  return weekIndices.map((wi) => {
    if (ps === 'maintain') {
      return { weekIndex: wi, phase: 'maintain', intensityPct: 70, volumeMultiplier: 1.0, repModifier: 0 };
    }
    if (ps === 'build_deload') {
      const rows = [
        { phase: 'foundation',  intensityPct: 65, volumeMultiplier: 1.0,  repModifier: 0 },
        { phase: 'progression', intensityPct: 70, volumeMultiplier: 1.15, repModifier: 0 },
        { phase: 'peak',        intensityPct: 75, volumeMultiplier: 1.25, repModifier: 0 },
        { phase: 'deload',      intensityPct: 60, volumeMultiplier: 0.70, repModifier: 2 },
      ];
      return { weekIndex: wi, ...rows[(wi - 1) % 4]! };
    }
    // 'build' — linear ramp, no formal deload; reps hold, load and sets climb
    const ramp = Math.min(wi - 1, 3);
    return {
      weekIndex: wi,
      phase: ramp === 0 ? 'foundation' : ramp < 3 ? 'progression' : 'peak',
      intensityPct: 65 + ramp * 4,
      volumeMultiplier: parseFloat((1.0 + ramp * 0.08).toFixed(2)),
      repModifier: 0,
    };
  });
}

const WEEKDAY_ABBR: Record<Weekday, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

function goalLine(goal: PlanInputs['goal']): string {
  if (goal === 'fat_loss') return 'Goal: Fat loss';
  if (goal === 'muscle') return 'Goal: Build muscle';
  if (goal === 'balanced') return 'Goal: Balanced (strength + cardio)';
  return `Goal: ${goal.charAt(0).toUpperCase()}${goal.slice(1)}`;
}

function splitLine(inputs: PlanInputs): string {
  if (inputs.splitPreference === 'custom') {
    const n = inputs.customSplit?.name?.trim();
    return n ? `Split: Custom (${n})` : 'Split: Custom';
  }
  if (inputs.splitPreference === 'auto') {
    return inputs.useRecommended
      ? 'Split: AI (using recommended pattern)'
      : 'Split: AI decide';
  }
  const labels: Record<string, string> = {
    full_body: 'Full body',
    upper_lower: 'Upper / lower',
    ppl: 'Push / pull / legs',
    body_part_days: 'Body part days',
  };
  const id = inputs.splitPreference;
  return `Split: ${labels[id] ?? id}`;
}

function equipmentDisplayTag(raw: string): string {
  const t = raw.toLowerCase().trim();
  const pretty: Record<string, string> = {
    barbell: 'Barbell',
    dumbbells: 'Dumbbells',
    machines: 'Machines',
    cable: 'Cable',
    kettlebells: 'Kettlebells',
    'pull-up bar': 'Pull-up bar',
    bands: 'Bands',
    'cardio machines': 'Cardio machines',
    none: 'None',
  };
  return pretty[t] ?? raw;
}

/**
 * Short periodization line for batch Groq (`generateFullProgram`) from progression style + preview length.
 * Capped at {@link MESO_HINT_MAX_LENGTH} chars (server validates the same).
 */
export function mesoHintForGenerateSessions(inputs: PlanInputs): string | undefined {
  const weeks = Math.max(1, Math.min(52, inputs.weeksCount || 1));
  const ps = inputs.progressionStyle;

  let stylePart: string;
  if (ps === 'build_deload') {
    stylePart =
      'Build quality volume with room for lighter recovery weeks in longer programs; avoid grinding every week to failure.';
  } else if (ps === 'maintain') {
    stylePart =
      'Maintain current strength and work capacity; favor consistency and small variation over aggressive PR chasing.';
  } else {
    stylePart =
      'Progressive overload when recovery allows; small weekly bumps to load or reps are enough—no need to reinvent the wheel each session.';
  }

  const weeksPart =
    weeks === 1
      ? ' This preview is one week—programSummary should stay grounded in this week only.'
      : ` This preview covers ${weeks} weeks—programSummary may hint how weeks connect without inventing extra weeks.`;

  const merged = `${stylePart}${weeksPart}`.replace(/\s+/g, ' ').trim();
  if (merged.length <= MESO_HINT_MAX_LENGTH) return merged;
  return merged.slice(0, MESO_HINT_MAX_LENGTH).trim();
}

/**
 * Bullet-style lines shown under “What drove this preview” on Plan Preview.
 */
/** The honest one-liner for who built the week. `undefined` = not reported by
 *  this backend build, so the old wording stands. */
/**
 * The coach check in one sentence for the preview: balanced, or the first
 * thing a coach would raise. Info-level findings do not make a note.
 */
export function coachCheckHeadline(report: CoachCheckReport | undefined): string | null {
  if (!report) return null;
  const notes = report.findings.filter((f) => f.severity !== 'info');
  if (notes.length === 0) {
    return 'Coach check: a balanced week. Every muscle sits inside its weekly band and no day stacks the same pattern.';
  }
  const first = notes[0]!.message.replace(/\s+$/, '');
  const rest = notes.length - 1;
  return rest === 0
    ? `Coach check: ${first}`
    : `Coach check: ${first} (${rest} more note${rest === 1 ? '' : 's'})`;
}

/** The detail behind the headline: every finding, then sets per muscle against the band. */
export function coachCheckDetailLines(report: CoachCheckReport | undefined): string[] {
  if (!report) return [];
  const lines: string[] = report.findings.map((f) => f.message);
  const muscles = Object.entries(report.volumeByMuscle)
    .filter(([, v]) => v.weighted > 0)
    .sort((a, b) => b[1].weighted - a[1].weighted);
  if (muscles.length > 0) {
    const aim = report.band ? ` (aim ${report.band.min}-${report.band.max})` : '';
    lines.push(`Sets per muscle this week${aim}:`);
    for (const [muscle, v] of muscles) {
      const sets = Number.isInteger(v.weighted) ? String(v.weighted) : v.weighted.toFixed(1);
      lines.push(
        v.exposures > 0
          ? `${muscle}: ${sets} sets over ${v.exposures} day${v.exposures === 1 ? '' : 's'}`
          : `${muscle}: ${sets} sets as a helper on other lifts`,
      );
    }
  }
  return lines;
}

export function builtByLine(builtBy: 'ai' | 'rules' | 'mixed' | undefined): string {
  if (builtBy === 'rules') return 'Built by our rules this time (the AI was not used)';
  if (builtBy === 'mixed') return 'Built with AI for some weeks and by our rules for others';
  return 'Built with AI (Gemini), then checked by our rules';
}

export function linesForPlanGenerationSnapshot(
  inputs: PlanInputs,
  builtBy?: 'ai' | 'rules' | 'mixed',
): string[] {
  const lines: string[] = [];
  lines.push(goalLine(inputs.goal));
  lines.push(
    `Training: ${inputs.daysPerWeek} day${inputs.daysPerWeek === 1 ? '' : 's'}/wk (${inputs.selectedWeekdays.map((d) => WEEKDAY_ABBR[d]).join(', ')})`,
  );
  if (inputs.weeksCount > 0) {
    lines.push(`Plan length: ${inputs.weeksCount} week${inputs.weeksCount === 1 ? '' : 's'}`);
  }
  if (inputs.startDateISO?.trim()) {
    lines.push(`Start: ${inputs.startDateISO}`);
  }
  lines.push(splitLine(inputs));
  lines.push(`Location: ${inputs.location === 'gym' ? 'Gym' : 'Home'}`);
  lines.push(
    `Experience: ${inputs.experienceLevel.charAt(0).toUpperCase()}${inputs.experienceLevel.slice(1)}`,
  );
  if (inputs.experienceLevel === 'beginner') {
    lines.push(
      'Coach cues: per-exercise notes only for Beginner (server caps each note for token safety).',
    );
  }
  if (inputs.location === 'gym' && inputs.equipmentTags.length) {
    lines.push(
      `Equipment filter: ${inputs.equipmentTags.map(equipmentDisplayTag).join(', ')}`,
    );
  }
  if (inputs.durationOverrides) {
    const d = inputs.durationOverrides;
    lines.push(
      `Session caps: strength ${d.strengthMin}–${d.strengthMax} min · cardio ${d.cardioMin}–${d.cardioMax} min · recovery ${d.recoveryMin}–${d.recoveryMax} min`,
    );
  } else {
    lines.push(`Session time: ${inputs.durationMin}–${inputs.durationMax} min`);
  }
  lines.push(`Detail: ${inputs.detailLevel === 'detailed' ? 'Detailed' : 'Simple'}`);
  if (inputs.hardDayLimits?.enabled) {
    lines.push(
      `Hard days: max ${inputs.hardDayLimits.maxHardDaysPerWeek ?? '—'}/wk, max ${inputs.hardDayLimits.maxHardDaysInARow ?? '—'} in a row`,
    );
  }
  const avoids = [
    ...(inputs.injuriesAvoid?.bodyAreas ?? []),
    ...(inputs.injuriesAvoid?.movementsOrEquipment ?? []),
  ].filter(Boolean);
  if (avoids.length) {
    lines.push(`Avoids: ${avoids.join(', ')}`);
  }
  if (inputs.cardioModalities?.length) {
    lines.push(`Cardio prefs: ${inputs.cardioModalities.join(', ')}`);
  }
  const meso = mesoHintForGenerateSessions(inputs);
  if (meso) {
    lines.push(`Periodization hint (sent to AI): ${meso}`);
  }
  lines.push(builtByLine(builtBy));
  return lines;
}

/**
 * Short bullets for Plan Preview: legacy route `inputs` fields that are **not** on
 * `POST /plans/generate-sessions` (see `GenerateSessionsDto`). `PlanInputs` may still
 * carry some of these for round-trip (e.g. activity level) without sending them to Groq.
 */
