export const DAYS_OF_WEEK_PREF = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayOfWeekPreference = (typeof DAYS_OF_WEEK_PREF)[number];

/** Two days is real: four of the five coach-built programs schedule at 2. */
export const TRAINING_FREQUENCY_OPTIONS = [2, 3, 4, 5, 6] as const;
export type TrainingFrequencyOption = (typeof TRAINING_FREQUENCY_OPTIONS)[number];

/**
 * How long one session can take. The strongest constraint on a plan after
 * days per week: the templates carry a minutes range and the generator takes
 * a min/max per session. `75` reads as "75+" in the UI.
 */
export const SESSION_MINUTES_OPTIONS = [30, 45, 60, 75] as const;
export type SessionMinutesOption = (typeof SESSION_MINUTES_OPTIONS)[number];
