/**
 * The profile's goal-adaptive data band (rev 3 of the profile redesign).
 *
 * The band between the identity card and the settings adapts to the user's
 * goal, with behavior able to override it. All pure so every rule is testable:
 * the screen feeds it preferences + fetched data and renders what it says.
 */

import type { WorkoutLog, PersonalBestMap, PersonalBest } from '../types/workout';
import type { BodyWeightEntry } from '../services/bodyWeightService';
// Type-only on purpose: the context module imports AsyncStorage, which this
// file's jest environment has no transform for.
import type { GoalOption } from '../contexts/UserPreferencesContext';

// ---------------------------------------------------------------------------
// Rule 1–5: which module leads, what the other one collapses to
// ---------------------------------------------------------------------------

export type ProfileBand = {
  /** The full card in the #2 slot; null when neither module has data. */
  lead: 'lifts' | 'weight' | null;
  /**
   * The demoted module's form: 'weightRow' renders inside Preferences,
   * 'weightCard'/'liftsStrip' render directly under the lead card.
   */
  second: 'weightCard' | 'weightRow' | 'liftsStrip' | null;
  /** What the identity card's gym-cred line shows. */
  caption: 'weightDelta' | 'trainingSince';
};

export type ProfileBandInput = {
  goal: GoalOption;
  secondaryGoal: GoalOption | null;
  /** Any best-lift rows resolved (rule 4: no records → no lifts module). */
  hasLiftRecords: boolean;
  /** Weigh-ins logged in the last 30 days (rule 3: behavior beats defaults). */
  weighInsLast30: number;
  /** Any weigh-in ever (rule 4: the weight card never renders empty). */
  hasAnyWeighIn: boolean;
};

export function resolveProfileBand(i: ProfileBandInput): ProfileBand {
  const weightGoal = i.goal === 'Fat loss';
  const liftGoal = i.goal === 'Strength' || i.goal === 'Hypertrophy';
  const weightActive = i.weighInsLast30 > 0;

  // Rule 1: the goal picks what leads; neutral goals defer to behavior.
  const wantsWeightLead = weightGoal || (!liftGoal && weightActive);

  let lead: ProfileBand['lead'] = null;
  if (wantsWeightLead && i.hasAnyWeighIn) lead = 'weight';
  else if (i.hasLiftRecords) lead = 'lifts';
  // Lift-goal user with no records yet but an active weight habit: better a
  // real weight card than an empty page (rules 3 + 4 together).
  else if (i.hasAnyWeighIn && weightActive) lead = 'weight';

  let second: ProfileBand['second'];
  if (lead === 'weight') {
    second = i.hasLiftRecords ? 'liftsStrip' : null;
  } else if (lead === 'lifts') {
    // Rule 2 (secondary goal adds) + rule 3 (tracking promotes).
    const promote = i.secondaryGoal === 'Fat loss' || weightActive;
    second = promote && i.hasAnyWeighIn ? 'weightCard' : 'weightRow';
  } else {
    second = 'weightRow';
  }

  // Rule 5: the caption follows what leads.
  return { lead, second, caption: lead === 'weight' ? 'weightDelta' : 'trainingSince' };
}

// ---------------------------------------------------------------------------
// Best lifts: most-trained movements, values from the lifetime records
// ---------------------------------------------------------------------------

export type RankedExercise = { exerciseId: string; name: string; sessions: number };
export type BestLift = { exerciseId: string; name: string; best: PersonalBest };

/** Ids the backend's records can't track (mirrors its isTrackableExerciseId gate). */
function trackable(id: string | null | undefined): id is string {
  const t = (id ?? '').trim();
  return t.length > 0 && t !== 'manual';
}

/**
 * The user's most-trained movements from a window of logs: ranked by how many
 * sessions included the exercise, then by total logged sets. Names come from
 * the newest entry that carried one. Ask for more than you'll show — some
 * frequent movements (pull-ups) have no weighted record and drop out when
 * zipped with the personal-best map.
 */
export function mostTrainedExercises(logs: WorkoutLog[], max = 6): RankedExercise[] {
  const byId = new Map<string, { sessions: number; sets: number; name: string; nameAt: number }>();
  for (const log of logs) {
    const seenThisLog = new Set<string>();
    const at = Date.parse(log.startedAt) || 0;
    for (const entry of log.entries ?? []) {
      if (!trackable(entry.exerciseId)) continue;
      const id = entry.exerciseId.trim();
      const row = byId.get(id) ?? { sessions: 0, sets: 0, name: '', nameAt: -1 };
      if (!seenThisLog.has(id)) {
        row.sessions += 1;
        seenThisLog.add(id);
      }
      row.sets += entry.completedSets?.length ?? 0;
      if (entry.name && at >= row.nameAt) {
        row.name = entry.name;
        row.nameAt = at;
      }
      byId.set(id, row);
    }
  }
  return [...byId.entries()]
    .map(([exerciseId, r]) => ({ exerciseId, name: r.name || exerciseId, sessions: r.sessions, sets: r.sets }))
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(({ exerciseId, name, sessions }) => ({ exerciseId, name, sessions }));
}

/** Zip the frequency ranking with the lifetime records; unweighted movements drop out. */
export function pickBestLifts(
  ranked: RankedExercise[],
  bests: PersonalBestMap,
  max = 3,
): BestLift[] {
  const lifts: BestLift[] = [];
  for (const r of ranked) {
    const best = bests[r.exerciseId];
    if (!best) continue;
    lifts.push({ exerciseId: r.exerciseId, name: r.name, best });
    if (lifts.length >= max) break;
  }
  return lifts;
}

// ---------------------------------------------------------------------------
// Body weight: deltas + the 12-week bar series
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function sortedByTime(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  return [...entries].sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

/** How many weigh-ins landed in the last `days` days. */
export function weighInsWithin(entries: BodyWeightEntry[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * DAY_MS;
  return entries.filter((e) => Date.parse(e.loggedAt) >= cutoff).length;
}

/**
 * The weight-card chip: newest minus oldest weigh-in inside the last 30 days.
 * Null with fewer than two entries in the window — one point is not a trend.
 */
export function weighInDelta30(entries: BodyWeightEntry[], now: Date): number | null {
  const cutoff = now.getTime() - 30 * DAY_MS;
  const inWindow = sortedByTime(entries).filter((e) => Date.parse(e.loggedAt) >= cutoff);
  if (inWindow.length < 2) return null;
  return inWindow[inWindow.length - 1].weightLb - inWindow[0].weightLb;
}

/**
 * The identity caption's number: newest weigh-in minus the first ever, with
 * when the journey started. Null until there are two entries.
 */
export function overallWeightDelta(
  entries: BodyWeightEntry[],
): { deltaLb: number; sinceIso: string } | null {
  const sorted = sortedByTime(entries);
  if (sorted.length < 2) return null;
  return {
    deltaLb: sorted[sorted.length - 1].weightLb - sorted[0].weightLb,
    sinceIso: sorted[0].loggedAt,
  };
}

/**
 * Weekly weight series for the card's bars, oldest → newest, `weeks` buckets
 * ending this week. Each bucket carries the last weigh-in at or before its
 * end; null until the first entry exists. View-based bars consume this — no
 * chart lib, no svg (OTA-safe).
 */
export function weeklyWeightSeries(
  entries: BodyWeightEntry[],
  weeks: number,
  now: Date,
): Array<number | null> {
  const sorted = sortedByTime(entries);
  const out: Array<number | null> = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now.getTime() - w * 7 * DAY_MS;
    let latest: number | null = null;
    for (const e of sorted) {
      if (Date.parse(e.loggedAt) <= end) latest = e.weightLb;
      else break;
    }
    out.push(latest);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

// Hand-rolled: Hermes on some Android builds ships without full Intl, where
// toLocaleDateString's options are silently ignored (same rationale as the
// month names in progressStats.ts).
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** "March", or "March 2025" when the year isn't the current one. */
export function monthLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const name = MONTH_NAMES[d.getMonth()];
  return d.getFullYear() === now.getFullYear() ? name : `${name} ${d.getFullYear()}`;
}
