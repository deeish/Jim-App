// User-facing "What's New" entries, newest first.
//
// To announce an update: prepend a new entry to CHANGELOG. The `id` must be
// unique + stable — it drives the "already seen" check, so giving a new entry a
// new id is what makes the What's New badge + popup re-appear for everyone.
//
// The release sheet shows ONLY the newest entry; the rest sit behind "See
// earlier updates". Keep the array at MAX_CHANGELOG_ENTRIES: when prepending a
// new entry, move the oldest card to docs/changelog-archive.md (the App Store's
// version history and git keep it too). The popup is the highlight reel for one
// release, not the archive.

export type ChangelogChangeType = 'new' | 'improved' | 'fixed';

/** Pruning target — the release sheet plus the capped "earlier updates" list. */
export const MAX_CHANGELOG_ENTRIES = 4;

export interface ChangelogChange {
  type: ChangelogChangeType;
  /**
   * Short bold lead-in for the release sheet's feature row ("A Home that
   * launches your day"). Entries without one fall back to the type label.
   */
  headline?: string;
  /** Ionicons glyph for the row's chip; falls back to the type's icon. */
  icon?: string;
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
  // The ONE card for this wave: the Home "Launchpad" redesign and the
  // goal-adaptive Profile "Athlete card". The week-tile split codes, recap
  // trims, haptics sweep, and this release sheet itself are part of those
  // stories, not separate lines. Copy rules: headlines read on their own (no
  // pronouns leaning on the row above) and stay plain — name the part that
  // changed and say what's different, no marketing lines.
  {
    id: '2026-08-25',
    version: '1.1.0',
    date: '2026-08-25',
    title: 'A new Home and Profile',
    changes: [
      {
        type: 'new',
        headline: 'New Home screen',
        icon: 'home',
        text: 'Today’s workout is now at the top, with your week, your streak, your last workout, and Quick Workout below it.',
      },
      {
        type: 'new',
        headline: 'New Profile page',
        icon: 'person',
        text: 'Your profile now shows your best lifts and your body weight trend, with settings in a cleaner list below.',
      },
      {
        type: 'improved',
        headline: 'Profile follows your goal',
        icon: 'flag',
        text: 'Strength and muscle goals show your best lifts first. Fat loss goals show your body weight first.',
      },
      {
        type: 'improved',
        headline: 'Slide between days and weeks',
        icon: 'swap-horizontal',
        text: 'The calendar now slides under your finger. The arrows next to the date do the same thing.',
      },
      {
        type: 'new',
        headline: 'New Crew tab',
        icon: 'people',
        text: 'Train with your friends: see who went today, build a shared streak, and pound their PRs. Start a crew with one code.',
      },
    ],
  },
  // The ONE card for this OTA: everything since build 26 (the finish
  // celebration + save, the day-actions menu + skip, set-aware Last time +
  // Target on the deck, history-aware recommendations). Trained-day
  // guardrails and the quick-workout landing fix are polish and stay out.
  {
    id: '2026-08-21',
    version: '1.1.0',
    date: '2026-08-21',
    title: 'Finish, celebrate, save',
    changes: [
      {
        type: 'new',
        text: 'Finishing a workout is now a moment: press Complete Workout for a celebration with your time, your streak, and any records you set, then a full session summary.',
      },
      {
        type: 'new',
        text: 'Save any finished workout to your library with one tap and run it again whenever you want.',
      },
      {
        type: 'improved',
        text: 'Nothing logs until you say so. Check your last set, add one more exercise if you feel like it, and press Complete Workout when you are done. Cut a session short and it still counts.',
      },
      {
        type: 'new',
        text: 'Every day now has a menu: skip a workout ahead of time, move it, or start a quick workout, right from the day view. Undo a skip anytime.',
      },
      {
        type: 'improved',
        text: 'Each set card now shows what you did for that exact set last time, plus a Target that moves you up when you are ready.',
      },
      {
        type: 'improved',
        text: 'Exercise recommendations now learn from your history, your goal, and the rest of your week.',
      },
    ],
  },
  // The ONE card for build 26: everything on this branch since
  // build 25 (Quick Workout, dark mode, missed day rescue + Make Room,
  // add another set, the library picker + remove exercise, gradient
  // month/week + legend sheet, haptics baseline).
  // Deliberately short so testers know what to look for; selector freeze,
  // rest-day open fix and the ended-program gate are polish and stay out.
  {
    id: '2026-08-19',
    version: '1.1.0',
    date: '2026-08-19',
    title: 'Quick Workout and dark mode',
    changes: [
      {
        type: 'new',
        text: 'Quick Workout: on a day with nothing scheduled, tap the muscles you want to train and get a complete session instantly. No plan needed.',
      },
      {
        type: 'new',
        text: 'Quick sessions match your goal, experience, and equipment, and are ordered the way a coach would run them.',
      },
      {
        type: 'new',
        text: 'Dark mode. Pick Light or Dark under Appearance in your Profile.',
      },
      {
        type: 'improved',
        text: 'Swapping or adding exercises now opens the full library: search, filters, and your saved list, with the best swaps for that exact slot pinned on top and the reason for each pick.',
      },
      {
        type: 'new',
        text: 'Remove an exercise from a day: hold its card and choose Remove Exercise.',
      },
      {
        type: 'new',
        text: 'Missed a workout? Move it to another day or let it go. Any workout can be moved, and the calendar makes room when a day is taken.',
      },
      {
        type: 'new',
        text: 'Add another set to any finished exercise, right from its set cards.',
      },
      {
        type: 'improved',
        text: 'The month and week views now wear the same muscle colors as the day view, with a color key one tap away.',
      },
      {
        type: 'improved',
        text: 'Gentle tap feedback across the whole app.',
      },
    ],
  },
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
  // Older cards live in docs/changelog-archive.md.
];

/** Most recent entry — what the badge + popup compare against. */
export const LATEST_CHANGELOG: ChangelogEntry | null = CHANGELOG[0] ?? null;
export const LATEST_CHANGELOG_ID: string | null = LATEST_CHANGELOG?.id ?? null;
