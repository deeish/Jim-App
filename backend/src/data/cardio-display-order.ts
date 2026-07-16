/**
 * Familiar gym order for library cardio: machines & modalities first, then
 * bodyweight / tools / sled. Session templates are excluded from catalog (see cardio-catalog-exclusions).
 * Unknown ids sort after known (high key), then alphabetical tiebreak in service.
 */
const CARDIO_LIBRARY_ORDER: readonly string[] = [
  // Treadmill / running belt
  'treadmill_walk_easy',
  'treadmill_incline_walk',
  'treadmill_jog_steady',
  'treadmill_run_intervals',
  'curve_treadmill_self_powered',
  // Bikes
  'stationary_bike_steady',
  'stationary_bike_intervals',
  'recumbent_bike_steady',
  'air_bike_assault',
  'outdoor_cycling_steady',
  // Elliptical / arc
  'elliptical_steady',
  'elliptical_intervals',
  'arc_trainer_steady',
  // Row / ski
  'rowing_machine_steady',
  'rowing_machine_intervals',
  'ski_erg_steady',
  'ski_erg_intervals',
  // Climbers / step
  'stair_climber_machine',
  'jacobs_ladder_machine',
  'versaclimber_machine',
  // Jump rope
  'jump_rope_single_under',
  'jump_rope_double_under',
  // Outdoor / swim
  'outdoor_jog_steady',
  'outdoor_run_intervals',
  'trail_hiking_brisk',
  'swimming_laps_easy',
  // Common bodyweight conditioning
  'jumping_jack',
  'high_knees',
  'burpee',
  'mountain_climber_cardio',
  'lateral_shuffle_conditioning',
  // Plyo / power
  'plyo_box_jump',
  'jump_squat_bodyweight',
  // Implements
  'kettlebell_swing_conditioning',
  'medicine_ball_slam',
  'battle_rope_alternating_waves',
  'battle_rope_double_slams',
  // Sled / carry / boxing
  'sled_push',
  'sled_drag_backward',
  'farmers_carry_brisk_walk',
  'shadow_boxing_rounds',
];

const ORDER_INDEX = new Map<string, number>(
  CARDIO_LIBRARY_ORDER.map((id, i) => [id, i]),
);

/** Lower = earlier in “familiar” cardio list. Unknown ids get a large base + stable hash. */
export function cardioLibrarySortKey(exerciseId: string): number {
  const i = ORDER_INDEX.get(exerciseId);
  if (i !== undefined) return i;
  let h = 0;
  for (let c = 0; c < exerciseId.length; c++) {
    h = (h * 31 + exerciseId.charCodeAt(c)) | 0;
  }
  return 10_000 + (Math.abs(h) % 10_000);
}
