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

export const TRAINING_FREQUENCY_OPTIONS = [3, 4, 5, 6] as const;
export type TrainingFrequencyOption = (typeof TRAINING_FREQUENCY_OPTIONS)[number];
