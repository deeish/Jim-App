/**
 * Active energy for a strength session, for the Apple Health workout Jim
 * writes. HealthKit only credits the Move ring for energy the workout carries,
 * and Jim does not measure heart rate, so this is an estimate from time and
 * body weight: kcal = MET × kg × hours.
 *
 * MET 4.5 is the Compendium of Physical Activities' "resistance training,
 * multiple exercises, 8–15 reps" figure (light 3.5, vigorous 6.0). A typical
 * gym hour lands in the 300s, which is what Apple Watch reports for the same
 * session, so the number reads as plausible rather than flattering.
 */
export const STRENGTH_TRAINING_MET = 4.5;

/** Used when the user has never logged a weight and Health has none to read. */
export const DEFAULT_BODY_WEIGHT_LB = 170;

const LB_PER_KG = 2.20462262;

export function estimateActiveEnergyKcal(
  seconds: number,
  bodyWeightLb: number | null | undefined,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const lb =
    typeof bodyWeightLb === 'number' && Number.isFinite(bodyWeightLb) && bodyWeightLb > 50
      ? bodyWeightLb
      : DEFAULT_BODY_WEIGHT_LB;
  const kg = lb / LB_PER_KG;
  return Math.max(1, Math.round(STRENGTH_TRAINING_MET * kg * (seconds / 3600)));
}
