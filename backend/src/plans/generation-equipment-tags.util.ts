/**
 * Maps Generate Plan UI equipment checklist values to exercise-library equipment
 * strings (see `EQUIPMENT_MAP` / `TransformedExercise.equipment` in exercise-mappings).
 */

const UI_TO_LIBRARY: Record<string, string[]> = {
  barbell: ['Barbell'],
  dumbbells: ['Dumbbell'],
  machines: ['Machine'],
  cable: ['Cable'],
  kettlebells: ['Kettlebell'],
  'pull-up bar': ['Pull-up Bar'],
  bands: ['Resistance Band'],
  'cardio machines': ['Machine'],
};

/**
 * @param uiTags lowercase ids from client (e.g. barbell, pull-up bar)
 * @returns deduped library labels; empty if none — caller treats as “no gym filter”
 */
export function mapPlanGenerationUiEquipmentToLibrary(
  uiTags: string[] | undefined | null,
): string[] {
  if (!uiTags?.length) return [];
  const out = new Set<string>();
  for (const raw of uiTags) {
    const key = String(raw ?? '')
      .toLowerCase()
      .trim();
    if (!key || key === 'none') continue;
    const mapped = UI_TO_LIBRARY[key];
    if (mapped) for (const m of mapped) out.add(m);
  }
  return [...out];
}
