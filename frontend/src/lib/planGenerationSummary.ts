/**
 * Human-readable lines for Plan Preview — matches what drives POST /plans/generate-sessions
 * (PlanInputs → buildGenerateSessionsRequest), not legacy route `inputs`.
 */

import type { PlanInputs, Weekday } from '../types/plan';

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
 * Sent to the backend as `weekProgression` so the LLM receives concrete weekly
 * targets rather than a vague periodization hint.
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
        { phase: 'foundation',  intensityPct: 65, volumeMultiplier: 1.0,  repModifier:  0 },
        { phase: 'progression', intensityPct: 70, volumeMultiplier: 1.15, repModifier: -1 },
        { phase: 'peak',        intensityPct: 75, volumeMultiplier: 1.25, repModifier: -2 },
        { phase: 'deload',      intensityPct: 60, volumeMultiplier: 0.70, repModifier:  2 },
      ];
      return { weekIndex: wi, ...rows[(wi - 1) % 4]! };
    }
    // 'build' — linear ramp, no formal deload
    const ramp = Math.min(wi - 1, 3);
    return {
      weekIndex: wi,
      phase: ramp === 0 ? 'foundation' : ramp < 3 ? 'progression' : 'peak',
      intensityPct: 65 + ramp * 4,
      volumeMultiplier: parseFloat((1.0 + ramp * 0.08).toFixed(2)),
      repModifier: -ramp,
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
export function linesForPlanGenerationSnapshot(inputs: PlanInputs): string[] {
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
  lines.push('AI: Groq (batched per week where possible)');
  return lines;
}

/**
 * Short bullets for Plan Preview: legacy route `inputs` fields that are **not** on
 * `POST /plans/generate-sessions` (see `GenerateSessionsDto`). `PlanInputs` may still
 * carry some of these for round-trip (e.g. activity level) without sending them to Groq.
 */
export function linesLegacyFormNotInAiRequest(): string[] {
  return [
    'Not sent to the AI request: two-a-day rules; auto-schedule and rest-day preference; weekday/weekend and per-day time caps.',
    'Not sent: workout formats (e.g. supersets vs straight sets; cardio steady-state vs intervals); hybrid mix ratio; program line variation index.',
    'Not sent: detailed equipment and cardio machine extras beyond the gym checklist filter; deload frequency, ramp, and progression target beyond the short periodization line above.',
    'Not sent: focus priority; activity level; preferred lifts; age; custom split hint text.',
  ];
}
