/**
 * Secondary muscles for preview chips: library order, de-duped case-insensitively,
 * excluding any entry that only repeats the primary muscle label.
 */
export function secondaryMusclesForPreview(
  secondaryMuscleGroups: string[] | undefined,
  primaryMuscleGroup: string | undefined,
): string[] {
  if (!secondaryMuscleGroups?.length) return [];
  const p = (primaryMuscleGroup ?? '').trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of secondaryMuscleGroups) {
    const t = (s ?? '').trim();
    if (!t || t.toLowerCase() === p) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
