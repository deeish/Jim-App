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
  // The ONE card for the next binary, 1.4.0: everything since 1.2.0 (32),
  // the last build external testers received. Build 1.3.0 (34) only ever
  // reached the internal tester, so its card (id 2026-09-15) is folded in
  // here rather than kept as a separate release; the id changes so the
  // sheet shows again for that one phone too.
  //
  // Contents, in the order a tester meets them: the rebuilt plan builder
  // (the coach's questions, weekly volume per muscle, the working weight,
  // effort target and rest on every set, weeks that adjust to what you log,
  // the new preview), hidden exercises, similar exercises with "Use
  // instead", then the 1.3.0 items (icon and launch, Connect Apple Health,
  // the two fixes, day names). Deliberately absent: the Gemini line in the
  // preview, the generation allowlist, the logo as loader, the "Build
  // muscle" goal (part of the builder story), the legal links, and
  // everything internal. Copy rules: headlines name the part that changed
  // and read on their own; text says what is different, no marketing lines.
  //
  // Build 1.4.0 (35) reached only the internal tester (Dylan) on 2026-09-18;
  // no external tester has seen anything since 1.2.0 (32). So the 1.5.0 card
  // is that card plus everything from 2026-09-22 (GitHub issues #45 to #61),
  // under one id: the first release external testers get after 1.2.0.
  {
    id: '2026-09-22',
    version: '1.5.0',
    date: '2026-09-22',
    title: 'Plans built like a coach builds them',
    changes: [
      {
        type: 'new',
        headline: 'A plan builder that asks the right questions',
        icon: 'clipboard',
        text: 'Generate a Plan now asks what a coach asks first: your goal, your days and time, the muscle you want to bring up, and the lifts you already do. Every big muscle is trained twice a week, sessions fit the time you have, and each week is checked against a weekly volume band for every muscle.',
      },
      {
        type: 'new',
        headline: 'Weight, effort and rest on every set',
        icon: 'barbell',
        text: 'Each strength row now carries a working weight from your logged sets, an effort target in reps in reserve, and a rest time. A lift you have never logged gets a calibration week to find its weight.',
      },
      {
        type: 'new',
        headline: 'Weeks that adjust to what you log',
        icon: 'trending-up',
        text: 'After a workout, answer how it went in three taps. The same day next week moves its sets, reps and weight one step from what you did, and a lift that stalls gets a lighter week on purpose. When a plan ends, the next block is offered, seeded from the last one.',
      },
      {
        type: 'improved',
        headline: 'A new plan preview',
        icon: 'list',
        text: 'The preview shows the week at a glance with a coach check on it. Open a day to see every lift with its weight and rest, swap an exercise for this week or every week, or rebuild the day. Generation keeps running if you leave the screen.',
      },
      {
        type: 'new',
        headline: 'Hide exercises you never want',
        icon: 'eye-off',
        text: 'On any exercise page, choose Don’t show me this. Hidden exercises never go into a plan, a rebuilt day or a swap. Manage the list under Hidden exercises in your Profile.',
      },
      {
        type: 'new',
        headline: 'Similar exercises',
        icon: 'swap-horizontal',
        text: 'Every exercise page lists the best swaps for it, best first, with the reason for each. Open the page from a workout and tap Use instead to put one in when the machine is taken.',
      },
      {
        type: 'new',
        headline: 'New icon and a faster launch',
        icon: 'rocket',
        text: 'Jim has a new icon and splash screen, and now opens straight into the app instead of holding on the logo.',
      },
      {
        type: 'new',
        headline: 'Connect Apple Health',
        icon: 'heart',
        text: 'Turn it on in your Profile, or when you finish a workout. Finished workouts are added to Apple Health, and your body weight from Health is used to estimate the energy of each session.',
      },
      {
        type: 'new',
        headline: 'Correct a set after the workout',
        icon: 'create',
        text: 'In the set breakdown, and on the finish screen, tap any set to change its reps or weight. Your history, records and next week read the corrected number.',
      },
      {
        type: 'new',
        headline: 'A stopwatch for holds and carries',
        icon: 'stopwatch',
        text: 'A timed exercise gets a stopwatch on its set card. Start gives you five seconds to get into position, then the clock counts up with your target on the ring, buzzes when you reach it, and keeps going if you hold longer. Stop fills in your time.',
      },
      {
        type: 'new',
        headline: 'Plates for the bar',
        icon: 'disc',
        text: 'On a barbell lift, a line under the inputs shows what to load on each side, and tapping it opens a bar you can build plate by plate.',
      },
      {
        type: 'new',
        headline: 'A beep when rest ends',
        icon: 'notifications',
        text: 'The rest timer beeps at zero on top of the buzz, and respects your ringer switch. Turn it off under Rest timer sound in your Profile. If a rest ends while your phone is locked, the app offers to nudge you with a notification, once, and only while a workout is running.',
      },
      {
        type: 'improved',
        headline: 'Every set needs its numbers',
        icon: 'checkmark-circle',
        text: 'The check waits until reps are entered, and a weight on a loaded lift. A chip above the inputs fills both from last time or from the target in one tap. Bodyweight exercises take a blank weight as bodyweight, and a BW chip in the weight box logs any set at bodyweight.',
      },
      {
        type: 'improved',
        headline: 'Complete Workout asks first',
        icon: 'flag',
        text: 'The button asks before it posts your session, shows how many sets were logged, and no longer catches the tap that finished your last set.',
      },
      {
        type: 'improved',
        headline: 'Finish screen and rest timer',
        icon: 'timer',
        text: 'The finish screen waits for your tap or swipe instead of moving on by itself. The rest tile shows its full time from the first frame.',
      },
      {
        type: 'fixed',
        headline: 'Workouts stay on screen',
        icon: 'lock-closed',
        text: 'Locking the phone mid-workout no longer flashes a message that the workout is not part of your plan. The plan also stays on screen when the connection drops at the gym.',
      },
      {
        type: 'fixed',
        headline: 'Day header and exercise cards',
        icon: 'resize',
        text: 'The session title on a day has its own line, so a long name no longer pushes the date and set count off the edge. On the Exercises tab the whole card responds to a tap, not just the name.',
      },
      {
        type: 'fixed',
        headline: 'Dark mode headers and launch',
        icon: 'moon',
        text: 'The back control at the top of the Calendar no longer flashes light while you move between Month, Week and Day, and the launch screen is dark on a dark phone.',
      },
      {
        type: 'fixed',
        headline: 'Doubled days',
        icon: 'calendar',
        text: 'A day could show its workout twice after an edit was saved on a weak connection. Edits are now saved in one step, and the app recognises a save that already went through.',
      },
      {
        type: 'improved',
        headline: 'Clearer workout names',
        icon: 'text',
        text: 'New plans name each day by what it trains, without the A and B labels.',
      },
    ],
  },
  // The card for build 1.2.0 (32), received by Friends/Family 2026-09-13:
  // everything since the last thing external testers had before it, which
  // was build 1.1.0 (25) plus the 2026-08-21
  // production OTA — i.e. the card below this one. Verified against App Store
  // Connect (25 is the only build IN_BETA_TESTING; 26 was uploaded and never
  // distributed) and `eas update:list`, not from memory.
  //
  // Contents: the Crew tab (v0 + wave 1: names, invites by code + link,
  // records, synced skips, the weekly goal hero, the four-week ordering, and
  // Rest up), the Home "Launchpad" redesign, the goal-adaptive Profile
  // "Athlete card", calendar paging, and keep-awake + a wall-clock rest timer.
  //
  // Deliberately absent: the loading-state sweep, the theme contrast pass, the
  // legal URLs, and every bug fix. The week-tile split codes, recap trims,
  // haptics sweep and this release sheet itself are part of the stories above,
  // not separate lines. Copy rules: headlines read on their own (no pronouns
  // leaning on the row above) and stay plain — name the part that changed and
  // say what's different, no marketing lines.
  //
  // ⚠ `date` is a guess until this ships. Set it to the real release date.
  {
    id: '2026-08-25',
    version: '1.2.0',
    date: '2026-08-27',
    title: 'Crew, Home, and Profile',
    changes: [
      {
        type: 'new',
        headline: 'New Crew tab',
        icon: 'people',
        text: 'Train with your friends. The crew’s week is at the top, and one list shows everyone’s days, ordered by who has trained most over the last four weeks. Miss a scheduled day and you have two days to make it up.',
      },
      {
        type: 'new',
        headline: 'Crew records',
        icon: 'sparkles',
        text: 'A new personal record shows on that person’s row, and anyone in the crew can pound it. Monday recaps and streak milestones show at the top.',
      },
      {
        type: 'new',
        headline: 'Crew invites',
        icon: 'person-add',
        text: 'Name your crew, then invite friends with the code or a link. Tap anyone to see their week.',
      },
      {
        type: 'new',
        headline: 'Rest up',
        icon: 'moon',
        text: 'Away or injured? Rest up pauses the days you owe the crew without leaving it. Anything you do train still counts, and you come back with one tap.',
      },
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
        text: 'Your profile now shows your best lifts and your body weight trend, with settings in a cleaner list below. Strength and muscle goals lead with lifts, fat loss goals lead with body weight.',
      },
      {
        type: 'improved',
        headline: 'Rest timer',
        icon: 'timer',
        text: 'The screen now stays on while you train, so it no longer locks between sets. The rest countdown keeps time while your phone is in your pocket instead of pausing.',
      },
      {
        type: 'improved',
        headline: 'Slide between days and weeks',
        icon: 'swap-horizontal',
        text: 'The calendar now slides under your finger. The arrows next to the date do the same thing.',
      },
      {
        type: 'improved',
        headline: 'Calendar edits that stick',
        icon: 'cloud-done',
        text: 'Exercises you add, swap or remove on a day, and Quick Workouts, are kept on your phone right away and saved to your plan as soon as the app can reach the server.',
      },
      {
        type: 'improved',
        headline: 'Coach-built programs',
        icon: 'shield-checkmark',
        text: 'Starting a program now uses the days from your profile instead of the program’s defaults, begins on your next training day, and swaps out exercises that load any joint you marked to work around.',
      },
      {
        type: 'new',
        headline: 'Work-arounds in Profile',
        icon: 'medkit',
        text: 'Mark the joints you are working around under Training in your profile. New plans skip exercises that load them, and you can choose to swap them out of your current plan too.',
      },
      {
        type: 'new',
        headline: 'Sign in with Apple, Google, or a code',
        icon: 'key',
        text: 'One sign-in screen for new and returning people. Continue with Apple or Google, or type your email and enter the six-digit code we send you. Your password still works if you have one.',
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
  // Older cards live in docs/changelog-archive.md.
];

/** Most recent entry — what the badge + popup compare against. */
export const LATEST_CHANGELOG: ChangelogEntry | null = CHANGELOG[0] ?? null;
export const LATEST_CHANGELOG_ID: string | null = LATEST_CHANGELOG?.id ?? null;
