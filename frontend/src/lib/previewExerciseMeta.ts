import type { ColorPalette } from '../theme/colors';

/** Short label for preview chips — keeps rows compact on small screens. */
export function shortBodyTagLabel(
  primaryMuscleGroup: string | undefined | null,
  exerciseName: string,
): string {
  const g = (primaryMuscleGroup ?? '').trim();
  if (g) {
    const key = g.toLowerCase();
    const map: Record<string, string> = {
      triceps: 'Tris',
      biceps: 'Bis',
      forearms: 'Forearms',
      chest: 'Chest',
      shoulders: 'Shoulders',
      back: 'Back',
      trapezius: 'Traps',
      quadriceps: 'Quads',
      hamstrings: 'Hams',
      glutes: 'Glutes',
      calves: 'Calves',
      abdominals: 'Core',
      core: 'Core',
      cardio: 'Cardio',
      'full body': 'Full',
      upper: 'Upper',
      'upper body': 'Upper',
      lower: 'Lower',
      'lower body': 'Lower',
    };
    if (map[key]) return map[key];
    if (g.length <= 10) return g;
    return g.slice(0, 9) + '…';
  }
  // Minimal fallback only when metadata is missing entirely.
  const n = (exerciseName ?? '').trim();
  if (/\b(run|jog|sprint|bike|cycle|rower|ski|swim|elliptical|assault|treadmill|stair|cardio|conditioning|finisher)\b/i.test(n)) {
    return 'Cardio';
  }
  return 'General';
}

export function parseCardioFinisherRow(suggestion: string): { name: string; reps: string } {
  const t = suggestion.trim();
  if (!t.length) return { name: 'Cardio finisher', reps: '—' };

  const minMatch = t.match(/(\d+)\s*(?:min|minutes?)\b/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    const name = t.length > 72 ? `${t.slice(0, 69)}…` : t;
    return { name, reps: `${mins} min` };
  }
  const secMatch = t.match(/(\d+)\s*(?:sec|seconds?)\b/i);
  if (secMatch) {
    const s = parseInt(secMatch[1], 10);
    return { name: t.length > 72 ? `${t.slice(0, 69)}…` : t, reps: `${s} sec` };
  }
  return { name: t.length > 72 ? `${t.slice(0, 69)}…` : t, reps: '—' };
}

type TagTone = 'chest' | 'back' | 'legs' | 'arms' | 'shoulders' | 'core' | 'cardio' | 'carry' | 'neutral';

function toneForTag(label: string): TagTone {
  const u = label.toUpperCase();
  if (u === 'CARDIO') return 'cardio';
  if (u === 'CARRY' || u === 'GRIP') return 'carry';
  if (/CHEST/.test(u)) return 'chest';
  if (/BACK|TRAPS|LATS/.test(u)) return 'back';
  if (/QUADS|HAMS|GLUTES|CALVES|LEGS/.test(u)) return 'legs';
  if (/TRIS|BIS|FORE|ARM/.test(u)) return 'arms';
  if (/SHOULD|DELT/.test(u)) return 'shoulders';
  if (/CORE|ABS/.test(u)) return 'core';
  return 'neutral';
}

/** Muted chip colors that read on dark/light surfaces without new theme tokens. */
export function bodyTagChipColors(label: string, colors: ColorPalette): { backgroundColor: string; color: string } {
  const tone = toneForTag(label);
  switch (tone) {
    case 'cardio':
      return { backgroundColor: `${colors.workoutCardio}28`, color: colors.workoutCardio };
    case 'carry':
      return { backgroundColor: `${colors.accent}28`, color: colors.accent };
    case 'chest':
      return { backgroundColor: colors.primarySoft, color: colors.primary };
    case 'back':
      return { backgroundColor: colors.successSoft, color: colors.success };
    case 'legs':
      return { backgroundColor: `${colors.secondary}33`, color: colors.secondary };
    case 'arms':
      return { backgroundColor: colors.warningSoft, color: colors.warning };
    case 'shoulders':
      return { backgroundColor: `${colors.accent}22`, color: colors.accent };
    case 'core':
      return { backgroundColor: `${colors.workoutRecovery}30`, color: colors.workoutRecovery };
    default:
      return { backgroundColor: colors.border, color: colors.textSecondary };
  }
}

/**
 * Short chip labels for secondary muscles beside the exercise title.
 * Skips raw secondaries that match primary, duplicate short labels, or the primary chip text.
 */
export function previewSecondaryChipLabels(
  secondaryMuscleGroups: string[] | undefined,
  legacySecondaryMuscleGroup: string | undefined | null,
  primaryMuscleGroup: string | undefined | null,
  exerciseName: string,
  primaryChipLabel: string,
): string[] {
  const raw: string[] = [];
  if (secondaryMuscleGroups?.length) {
    for (const g of secondaryMuscleGroups) {
      const t = (g ?? '').trim();
      if (t) raw.push(t);
    }
  } else {
    const one = (legacySecondaryMuscleGroup ?? '').trim();
    if (one) raw.push(one);
  }
  const p = (primaryMuscleGroup ?? '').trim().toLowerCase();
  const primaryTag = primaryChipLabel.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const mus of raw) {
    if (mus.toLowerCase() === p) continue;
    const short = shortBodyTagLabel(mus, exerciseName);
    if (!short) continue;
    const st = short.toLowerCase();
    if (st === primaryTag) continue;
    if (seen.has(st)) continue;
    seen.add(st);
    out.push(short);
  }
  return out;
}
