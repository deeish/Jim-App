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
  // One entry covering the whole Calendar release for the Friends/Family
  // group: external testers last received the 2026-08-13 update (build 18 +
  // OTA), so the former 2026-08-14, 2026-08-15 and 2026-08-16 cards were
  // merged in here. Fixes for regressions that only internal builds ever had
  // (views opening scrolled down) are dropped, and the completed-day mark is
  // described as it ships now (gold seal), not the strike or ring it briefly
  // was between internal builds.
  {
    id: '2026-08-17',
    version: '1.1.0',
    date: '2026-08-17',
    title: 'Your plan is now a calendar',
    changes: [
      { type: 'new', text: 'The Plan and Train tabs became one Calendar: month, week, and day views with every muscle color coded.' },
      { type: 'new', text: 'The day view is full color: every exercise card wears its muscle color as a smooth gradient, with the muscle name on a frosted chip.' },
      { type: 'new', text: 'Log sets right on the calendar with swipeable set cards, a rest timer that counts down in the REST tile, and a celebration when you finish.' },
      { type: 'new', text: 'Swap or add exercises on any day, with recommendations from the library. Your plan saves the change.' },
      { type: 'improved', text: 'A finished day earns a gold seal on the month grid, missed days fade back, and everything counts toward History and Progress.' },
      { type: 'improved', text: 'A finished session shows every set as a completed card, with skipped sets marked.' },
      { type: 'improved', text: 'A workout in progress now survives closing the app, and you can log a shorter session as done.' },
      { type: 'new', text: 'The calendar taps back: logging a session, swapping an exercise, flipping a page, and the end of a rest each have their own feel.' },
      { type: 'improved', text: 'Recommended on the Exercises page is now a proper All | Recommended switch under the search bar.' },
    ],
  },
  {
    id: '2026-08-13',
    version: '1.1.0',
    date: '2026-08-13',
    title: 'Programs that fit your week',
    changes: [
      { type: 'new', text: 'Two new coach-built programs: Beginner Full Body, your first eight weeks of barbells, and Home Dumbbell Full Body, which needs only dumbbells and a bench.' },
      { type: 'new', text: 'Every program now adjusts to your schedule. Run the 6 day Push/Pull/Legs on 4 days and the sessions rotate through your week automatically.' },
      { type: 'new', text: 'Jim score: our quality rating for every exercise, right on its page.' },
      { type: 'improved', text: 'Applying a program that starts next Monday now opens on its first week, so you can see everything you are about to train.' },
      { type: 'fixed', text: 'The saved workouts page no longer sits under the clock.' },
    ],
  },
  {
    id: '2026-08-11',
    version: '1.1.0',
    date: '2026-08-11',
    title: 'A smarter exercise library',
    changes: [
      { type: 'improved', text: 'Every exercise was reviewed and ranked. Look for the Recommended star, filter to just those, and plans now lead with the best options.' },
      { type: 'new', text: 'A redesigned exercise page: key facts at a glance, clearer muscle maps, and everything in easy cards.' },
      { type: 'new', text: 'Exercise pages suggest easier and harder versions you can jump between.' },
      { type: 'new', text: 'The common mistakes for each exercise, with the fix.' },
      { type: 'new', text: 'Replacements respect limitations like a sore shoulder or knee.' },
      { type: 'improved', text: 'A refreshed Plan tab with week progress, rest days, and quick actions.' },
    ],
  },
  // One entry covering everything since build 13, the last build distributed to
  // the Friends/Family group (confirmed against App Store Connect 2026-08-05:
  // builds 14-17 were internal only). The former 2026-07-23, 2026-08-04 and
  // 2026-08-05 cards were merged in here: external testers never saw them, and
  // four stacked cards for one release would bury the headline changes.
  {
    id: '2026-08-06',
    version: '1.1.0',
    date: '2026-08-06',
    title: 'The big redesign update',
    changes: [
      { type: 'new', text: 'Templates: three coach-built 8 week programs, applied in a couple of taps.' },
      { type: 'new', text: 'Setup now ends with a program matched to your answers.' },
      { type: 'new', text: 'Progress page: week streak, totals, and weekly trend.' },
      { type: 'new', text: 'Exercise history: your best set, estimated one rep max, and recent sessions.' },
      { type: 'new', text: 'Workouts show your last numbers and suggest a next target.' },
      { type: 'new', text: 'New profile avatars.' },
      { type: 'improved', text: 'A cleaner look across the app, with a single light theme.' },
      { type: 'improved', text: 'Floating glass tab bar on iOS 26.' },
      { type: 'improved', text: 'The Workout tab is now Train, built around one Start button.' },
      { type: 'improved', text: 'Redesigned plan builder and Profile pages.' },
      { type: 'improved', text: 'Plans can start today instead of next Monday.' },
      { type: 'improved', text: 'Workout summaries show personal bests and total volume.' },
      { type: 'improved', text: 'New app icon and launch screen.' },
      { type: 'fixed', text: 'Back buttons return you to the page you came from.' },
      { type: 'fixed', text: 'Clearing a plan no longer leaves the old name in the header.' },
      { type: 'fixed', text: 'Showing your password no longer shifts the sign in screen.' },
    ],
  },
  {
    id: '2026-07-16',
    version: '1.0.0',
    date: '2026-07-16',
    title: 'Share workouts with your gym buddy',
    changes: [
      { type: 'new', text: 'Share your plan with your gym partner. The feature is on the Plan page once a workout is generated: send a code or have them scan your QR code.' },
    ],
  },
  {
    id: '2026-07-15',
    version: '1.0.0',
    date: '2026-07-15',
    title: 'Smarter workout generation and search',
    changes: [
      { type: 'improved', text: 'Generated workouts now balance pushing and pulling and avoid stacking similar movements.' },
      { type: 'improved', text: 'Every session fits the time you picked, including your hardest weeks.' },
      { type: 'improved', text: 'Plans covering several weeks now build up, peak, and finish with a lighter recovery week, keeping the same core lifts throughout.' },
      { type: 'improved', text: 'Exercise search now understands everyday spellings, typos, and gym slang. Searches like "pullup", "dumbell press", or "ohp" find the right exercise instead of coming up empty.' },
      { type: 'improved', text: 'A simpler goal step when setting up your profile.' },
      { type: 'new', text: 'Clear an entire week from your plan, with a quick confirmation before a repeated week starts.' },
      { type: 'fixed', text: 'Saving a workout with the heart now responds instantly and reliably adds it to your saved list.' },
      { type: 'fixed', text: 'Plan controls display correctly on smaller screens.' },
    ],
  },
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
