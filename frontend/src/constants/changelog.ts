// User-facing "What's New" entries, newest first.
//
// To announce an update: prepend a new entry to CHANGELOG. The `id` must be
// unique + stable — it drives the "already seen" check, so giving a new entry a
// new id is what makes the What's New badge + popup re-appear for everyone.

export type ChangelogChangeType = 'new' | 'improved' | 'fixed';

export interface ChangelogChange {
  type: ChangelogChangeType;
  text: string;
}

export interface ChangelogEntry {
  /** Unique, stable id for this release — drives the "seen" badge + popup. */
  id: string;
  /** Display version label (e.g. the app version). */
  version: string;
  /** ISO date (YYYY-MM-DD) shown in the entry header. */
  date: string;
  /** Optional short headline for the release. */
  title?: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-06-19',
    version: '1.0.0',
    date: '2026-06-19',
    title: 'Polish & fixes',
    changes: [
      { type: 'improved', text: 'A brand-new app icon and refreshed logo.' },
      { type: 'fixed', text: 'Regenerating a workout now rebuilds the full session to match that day’s focus.' },
      { type: 'improved', text: 'Smoother navigation — returning to your Plan no longer flashes a loading screen; it stays put and refreshes in the background.' },
      { type: 'fixed', text: 'Tapping “More information” on an exercise now opens its details while you’re adding it to a plan.' },
    ],
  },
  {
    id: '2026-06-17',
    version: '1.0.0',
    date: '2026-06-17',
    title: 'Welcome to the Jim beta',
    changes: [
      { type: 'new', text: 'Personalized AI workout plans built around your goal, experience, and equipment.' },
      { type: 'improved', text: 'Smarter sets & reps — rep ranges now adapt to your goal and each exercise’s role.' },
      { type: 'improved', text: 'Higher-quality plans with cleaner workout splits and better-balanced volume.' },
      { type: 'improved', text: 'Faster exercise search with smoother scrolling.' },
      { type: 'improved', text: 'Refreshed home screen.' },
    ],
  },
];

/** Most recent entry — what the badge + popup compare against. */
export const LATEST_CHANGELOG: ChangelogEntry | null = CHANGELOG[0] ?? null;
export const LATEST_CHANGELOG_ID: string | null = LATEST_CHANGELOG?.id ?? null;
