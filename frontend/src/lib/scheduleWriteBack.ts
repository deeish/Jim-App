import {
  DAYS_OF_WEEK_PREF,
  SESSION_MINUTES_OPTIONS,
  TRAINING_FREQUENCY_OPTIONS,
  type DayOfWeekPreference,
  type SessionMinutesOption,
  type TrainingFrequencyOption,
} from '../constants/trainingSchedule';

/**
 * What a plan-making page saves back to the preferences when a plan is
 * generated or a program applied, so the NEXT plan starts from the last
 * choice instead of the onboarding answer.
 *
 * The schedule has no editor in Profile on purpose: people change it when
 * they make a plan (the AI form, the program sheet). That only holds if
 * those pages remember what was picked — before this, the form was seeded
 * from onboarding once and never wrote anything back.
 */

/** The frequency option a day count maps to, or null when the picker cannot
 *  show it (a 1- or 7-day plan keeps the stored preference). */
export function frequencyOptionFor(count: number): TrainingFrequencyOption | null {
  return (TRAINING_FREQUENCY_OPTIONS as readonly number[]).includes(count)
    ? (count as TrainingFrequencyOption)
    : null;
}

/** The session-length step nearest the TOP of a min–max window (the seed put
 *  the preference at the top: 45 → 30–45); "75+" absorbs anything longer. */
export function sessionMinutesOptionFor(range: { min: number; max: number }): SessionMinutesOption {
  const target = Math.max(range.min, range.max);
  let best: SessionMinutesOption = SESSION_MINUTES_OPTIONS[0];
  for (const opt of SESSION_MINUTES_OPTIONS) {
    if (Math.abs(opt - target) < Math.abs(best - target)) best = opt;
  }
  return best;
}

export type ScheduleWriteBack = {
  trainingFrequency: TrainingFrequencyOption | null;
  trainingDaysFlexible: boolean;
  preferredTrainingDays: DayOfWeekPreference[];
};

function orderDays(days: readonly string[]): DayOfWeekPreference[] {
  const valid = new Set<string>(DAYS_OF_WEEK_PREF);
  return [...new Set(days.filter((d) => valid.has(d)))]
    .map((d) => d as DayOfWeekPreference)
    .sort((a, b) => DAYS_OF_WEEK_PREF.indexOf(a) - DAYS_OF_WEEK_PREF.indexOf(b));
}

function sameDays(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((d) => set.has(d));
}

/**
 * Days equal to the page's own default pattern for that count stay
 * "flexible" (nothing stored), so the next program keeps ITS default days
 * rather than inheriting the AI form's pattern. Any other choice is stored
 * as picked days.
 */
export function scheduleWriteBack(
  days: readonly string[],
  defaultDays: readonly string[],
): ScheduleWriteBack {
  const chosen = orderDays(days);
  const flexible = sameDays(chosen, defaultDays);
  return {
    trainingFrequency: frequencyOptionFor(chosen.length),
    trainingDaysFlexible: flexible,
    preferredTrainingDays: flexible ? [] : chosen,
  };
}
