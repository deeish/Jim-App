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
    id: '2026-07-07',
    version: '1.0.0',
    date: '2026-07-07',
    title: 'Weight tracking, a better exercise library, and plan fixes',
    changes: [
      { type: 'new', text: 'Track your body weight and see your trend over time.' },
      { type: 'new', text: 'Pick a second goal and your plan blends both.' },
      { type: 'new', text: 'Exercise pages now show the muscles you are working on a body map, zoomed to the target area.' },
      { type: 'improved', text: 'A rebuilt Exercises tab: browse the full catalog right away, with simpler filters, quick access to your saved exercises, and a mini muscle map on every exercise.' },
      { type: 'improved', text: 'Cleaner exercise pages: color-coded muscle groups, and how-to steps tucked behind a tap so the demo video stays front and center.' },
      { type: 'fixed', text: 'Your plan no longer disappears when it ends. It now repeats its final week until you generate a new one.' },
      { type: 'fixed', text: 'Generated plans you have not saved yet are kept, so you can pick up where you left off.' },
      { type: 'fixed', text: 'Days only show as complete after you finish the workout.' },
    ],
  },
  {
    id: '2026-06-23',
    version: '1.0.0',
    date: '2026-06-23',
    title: 'Improvements and fixes',
    changes: [
      { type: 'improved', text: 'A new app icon and refreshed logo.' },
      { type: 'improved', text: 'Swap a single exercise in your plan for a better one that targets the same muscle, without changing the rest of your day.' },
      { type: 'improved', text: 'Muscle search now lets you pick a group to see everything in it, then narrow to specific areas like Lats or Traps only when you want.' },
      { type: 'improved', text: 'Smoother navigation: returning to your Plan keeps its content instead of flashing a loading screen, and refreshes quietly in the background.' },
      { type: 'fixed', text: 'Regenerating a workout now rebuilds the full session to match that day’s focus.' },
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
      { type: 'improved', text: 'Smarter sets and reps that adapt to your goal and each exercise’s role.' },
      { type: 'improved', text: 'Higher-quality plans with cleaner workout splits and better-balanced volume.' },
      { type: 'improved', text: 'Faster exercise search with smoother scrolling.' },
      { type: 'improved', text: 'Refreshed home screen.' },
    ],
  },
];

/** Most recent entry — what the badge + popup compare against. */
export const LATEST_CHANGELOG: ChangelogEntry | null = CHANGELOG[0] ?? null;
export const LATEST_CHANGELOG_ID: string | null = LATEST_CHANGELOG?.id ?? null;
