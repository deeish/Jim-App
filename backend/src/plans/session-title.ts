/**
 * Keep a session's name honest after the rules have edited its exercises.
 *
 * The model names a day "Upper · Press + Pull-Up" from the lifts it chose.
 * Enrichment then swaps, drops and inserts rows (equipment conformance, the
 * pattern floors, dedupe), and the name is never revisited — the 2026-09-16
 * review found "Press + Pull-Up" with no pull-up and "Trap + Hip" with no
 * trap-bar lift. This pass checks each lift named after the " · " against the
 * final list and rebuilds the suffix from the first two lifts when one is gone.
 * Names without the suffix, or whose lifts are all still present, are left
 * exactly as they were.
 */

type NamedRow = { name?: string | null };

/** Short lift nouns, most specific first. The first match wins. */
const SHORT_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/romanian deadlift|\brdl\b/i, 'RDL'],
  [/trap[- ]bar/i, 'Trap Bar'],
  [/sumo deadlift/i, 'Sumo'],
  [/hip thrust|glute bridge/i, 'Hip Thrust'],
  [/front squat/i, 'Front Squat'],
  [/goblet squat/i, 'Goblet'],
  [/hack squat/i, 'Hack Squat'],
  [/split squat|bulgarian/i, 'Split Squat'],
  [/leg press/i, 'Leg Press'],
  [/incline/i, 'Incline'],
  [/bench press|chest press/i, 'Bench'],
  [/overhead press|military press|shoulder press|push press|\bohp\b/i, 'Press'],
  [/pull-?up|chin-?up/i, 'Pull-Up'],
  [/pulldown|pull-down/i, 'Pulldown'],
  [/face pull/i, 'Face Pull'],
  [/\brow\b|\brows\b/i, 'Row'],
  [/power clean|hang clean|\bclean\b/i, 'Clean'],
  [/snatch/i, 'Snatch'],
  [/deadlift/i, 'Deadlift'],
  [/squat/i, 'Squat'],
  [/lunge/i, 'Lunge'],
  [/step-?up/i, 'Step-Up'],
  [/\bdip\b|\bdips\b/i, 'Dip'],
  [/push-?up/i, 'Push-Up'],
  [/fly\b|flye\b|flyes\b|flies\b|crossover/i, 'Fly'],
  [/curl/i, 'Curl'],
  [/pushdown|push-down|extension/i, 'Extension'],
  [/lateral raise|front raise|raise/i, 'Raise'],
  [/shrug/i, 'Shrug'],
  [/carry/i, 'Carry'],
  [/plank/i, 'Plank'],
];

/** The lift noun a title uses for an exercise ("Flat Barbell Bench Press" → "Bench"). */
export function shortLiftName(exerciseName: string): string {
  for (const [re, short] of SHORT_NAMES) {
    if (re.test(exerciseName)) return short;
  }
  const words = exerciseName.trim().split(/\s+/);
  return words[words.length - 1] ?? exerciseName;
}

/** Does the named lift ("Pull-Up", "Trap", "Hip") still appear in the list? */
function liftPresent(token: string, exercises: NamedRow[]): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return true;
  return exercises.some((ex) => {
    const name = (ex.name ?? '').toLowerCase();
    if (!name) return false;
    if (name.includes(t)) return true;
    // A token may be the short name the model chose for the lift.
    return shortLiftName(ex.name ?? '').toLowerCase() === t;
  });
}

/**
 * "Upper · Press + Pull-Up" + final exercises → the same name when every
 * named lift is still there, otherwise "Upper · <first> + <second>" from the
 * first two rows (or one, when the session has a single row).
 */
export function conformSessionTitleToExercises(
  title: string | undefined | null,
  exercises: NamedRow[],
): string | undefined | null {
  if (!title) return title;
  const m = title.match(/^(.*?)\s·\s(.+)$/);
  if (!m) return title;
  const prefix = m[1]!.trim();
  const suffix = m[2]!.trim();
  const tokens = suffix
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return title;
  if (tokens.every((t) => liftPresent(t, exercises))) return title;

  const names = exercises
    .map((ex) => (ex.name ?? '').trim())
    .filter((n) => n.length > 0);
  if (names.length === 0) return prefix || title;
  const shorts: string[] = [];
  for (const n of names) {
    const s = shortLiftName(n);
    if (!shorts.includes(s)) shorts.push(s);
    if (shorts.length === 2) break;
  }
  return `${prefix} · ${shorts.join(' + ')}`;
}
