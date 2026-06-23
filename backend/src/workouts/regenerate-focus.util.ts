/**
 * Detects whether a label carries a real training-focus word.
 *
 * This mirrors how the generator actually resolves a focus into a candidate pool:
 * `ExercisesService.focusToMuscleGroups` and `getAnchorIdsForFocus` both match focus
 * words with word boundaries (`\bpush\b`, `/^lower\b/`), NOT exact equality. We match
 * the same way so titles like "Upper 1" / "Lower 2" (repeated-split numbering) count as
 * recognized, while a display detail line ("45 min · Strength · 5 exercises") does not.
 */
const FOCUS_WORD =
  /\b(push|pull|legs?|upper|lower|full body|upper body|lower body|cardio|recovery|chest|back|shoulders?|arms?)\b/i;

/** True when `label` contains a real training focus (not a detail line or hype title). */
export function isRecognizedFocus(label: string | null | undefined): boolean {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return false;
  return FOCUS_WORD.test(trimmed);
}

/**
 * Pick the training focus to regenerate a workout against.
 *
 * The `focus` column is a *display detail line* ("45 min · Strength · 5 exercises") for
 * plan-linked workouts — never a training focus. Feeding it to the generator collapsed
 * regeneration to a full-body pool (e.g. calf raises on a push day). The day title
 * ("Push", "Upper 1", "Lower 2", "Full Body") is the authoritative focus signal, so
 * prefer it and only fall back to `focus` when it is itself a recognized focus.
 */
export function resolveRegenFocus(
  name: string | null | undefined,
  focus: string | null | undefined,
): string {
  const title = (name ?? '').trim();
  if (isRecognizedFocus(title)) return title;

  const detail = (focus ?? '').trim();
  if (isRecognizedFocus(detail)) return detail;

  // Last resort: keep whatever title we have so naming/reasoning stay sensible;
  // the generator will treat an unknown label as full body.
  return title || detail || 'full body';
}
