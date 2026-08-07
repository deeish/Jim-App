/**
 * Human display form of a plan's stored name.
 *
 * Generated plans are named with a machine pattern derived at apply time
 * (`Strength · 4d/wk · 1 wk` — see PlanPreviewScreen's derivedName), which
 * reads as config tokens when used as the plan's visible identity. This
 * rewrites that one pattern into people-speak and drops the weeks token —
 * the Plan tab's week header ("Week 3 of 8") owns program length now.
 * Any other name (template programs, user-renamed plans) passes through
 * verbatim; a display transform must never mangle a real name.
 */
const GENERATED_NAME = /^(.+?) · (\d+)d\/wk · \d+ wks?$/;

export function formatPlanDisplayName(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'My Plan';
  const m = raw.match(GENERATED_NAME);
  if (!m) return raw;
  const goal = m[1];
  const days = Number(m[2]);
  return `${goal} · ${days} ${days === 1 ? 'day' : 'days'} a week`;
}
