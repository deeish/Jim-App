/**
 * Human display form of a plan's stored name.
 *
 * A plan's visible title is an identity, not a self-description: any fact it
 * states (training frequency, week count) can rot the moment the user edits
 * the plan, and the day list below always shows the live truth. So generated
 * machine names ("Strength · 4d/wk · 1 wk" — see PlanPreviewScreen's
 * derivedName) reduce to their one durable part, the goal: "Strength Plan".
 * The backend's manual-create default ("Plan 8/6/2026") reads as "My Plan".
 * Anything else — template programs, user-chosen names — passes through
 * verbatim; a display transform must never mangle a real name.
 */
const GENERATED_NAME = /^(.+?) · \d+d\/wk · \d+ wks?$/;
const DATE_DEFAULT_NAME = /^Plan \d{1,2}\/\d{1,2}\/\d{2,4}$/;

export function formatPlanDisplayName(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'My Plan';
  if (DATE_DEFAULT_NAME.test(raw)) return 'My Plan';
  const m = raw.match(GENERATED_NAME);
  if (!m) return raw;
  // Goal labels can carry a parenthetical ("Balanced (Strength + Cardio)");
  // the title keeps just the headline word(s).
  const goal = m[1].replace(/\s*\(.*\)\s*$/, '').trim();
  if (!goal) return 'My Plan';
  return /\bplan$/i.test(goal) ? goal : `${goal} Plan`;
}
