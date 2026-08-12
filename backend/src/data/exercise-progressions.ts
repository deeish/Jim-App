/**
 * Exercise progression ladders (catalog follow-up, 2026-08-11).
 *
 * Each ladder orders a movement family easiest → hardest. A step is a set
 * of roughly-equivalent options (knee push-up and incline push-up are both
 * one step below the push-up, not ordered against each other). An
 * exercise's "easier" list is every id one step down, "harder" every id
 * one step up, across all ladders it appears in.
 *
 * Ladders are SKILL/LOAD paths a coach would actually prescribe — not
 * every variant relationship. Rows can appear in multiple ladders (the
 * push-up heads both the main and the plyo path). Ids are immutable
 * catalog ids; the spec enforces existence, visibility, uniqueness within
 * a ladder, and non-decreasing difficulty along each ladder.
 *
 * Consumed by GET /exercises/:id (detail screen "Easier / Harder" chips).
 * Generation does not read this file.
 */

export interface ProgressionLadder {
  name: string;
  /** Easiest → hardest; each step is one or more interchangeable ids. */
  steps: string[][];
}

export const PROGRESSION_LADDERS: ProgressionLadder[] = [
  // ── Push-up family ────────────────────────────────────────────────────
  {
    name: 'push-up',
    steps: [
      ['wall_push_up'],
      ['knee_push_up', 'incline_push_up'],
      ['push_up'],
      ['deficit_push_up', 'decline_push_up', 'weighted_push_up'],
      ['archer_push_up'],
      ['one_arm_push_up'],
    ],
  },
  {
    name: 'triceps push-up',
    steps: [
      ['close_grip_push_up'],
      ['diamond_push_up'],
      ['weighted_close_grip_push_up', 'weighted_diamond_push_up'],
    ],
  },
  {
    name: 'overhead bodyweight press',
    steps: [['incline_pike_push_up'], ['pike_push_up'], ['handstand_push_up']],
  },
  // ── Pull-up family ────────────────────────────────────────────────────
  {
    name: 'pull-up',
    steps: [
      ['active_hang_scapular_pull'],
      [
        'band_assisted_pull_up',
        'machine_assisted_pull_up',
        'negative_pull_up',
        'jumping_pull_up',
      ],
      ['pull_up_pronated'],
      ['weighted_pull_up'],
      ['archer_pull_up'],
      ['one_arm_pull_up_assisted'],
      ['one_arm_pull_up'],
    ],
  },
  {
    name: 'chin-up',
    steps: [
      ['hip_width_feet_elevated_chin_up'],
      ['chin_up'],
      ['chin_up_weighted_belt'],
    ],
  },
  {
    name: 'muscle-up',
    steps: [
      ['chest_to_bar_pull_up', 'pull_up_explosive'],
      ['bar_muscle_up'],
      ['ring_muscle_up'],
    ],
  },
  {
    name: 'inverted row',
    steps: [
      ['table_lat_row'],
      ['overhand_bodyweight_row'],
      ['feet_elevated_row_lat'],
    ],
  },
  {
    name: 'ring row',
    steps: [['ring_row'], ['ring_row_weighted']],
  },
  {
    name: 'dead hang',
    steps: [
      ['dead_hang'],
      ['towel_dead_hang', 'thick_bar_hang'],
      ['one_arm_assisted_dead_hang'],
    ],
  },
  // ── Dips ──────────────────────────────────────────────────────────────
  {
    name: 'dip',
    steps: [
      ['assisted_dip_machine', 'assisted_parallel_bar_dip', 'bench_dip'],
      ['parallel_bar_dip'],
      ['weighted_parallel_bar_dip'],
      ['ring_dip'],
      ['weighted_ring_dip'],
    ],
  },
  {
    name: 'chest dip',
    steps: [['chest_dip'], ['weighted_chest_dip']],
  },
  // ── Squat family ──────────────────────────────────────────────────────
  {
    name: 'squat',
    steps: [
      ['bodyweight_box_squat'],
      ['bodyweight_squat'],
      ['goblet_squat'],
      ['back_squat'],
    ],
  },
  {
    name: 'pistol squat',
    steps: [
      ['assisted_pistol_squat'],
      ['pistol_squat_to_box', 'counterbalance_pistol_squat'],
      ['pistol_squat'],
    ],
  },
  {
    name: 'skater squat',
    steps: [['assisted_skater_squat'], ['skater_squat']],
  },
  {
    name: 'shrimp squat',
    steps: [['assisted_shrimp_squat'], ['shrimp_squat']],
  },
  {
    name: 'sissy squat',
    steps: [['machine_sissy_squat'], ['sissy_squat']],
  },
  {
    name: 'split squat',
    steps: [
      ['split_squat'],
      ['rear_foot_elevated_split_squat'],
      ['dumbbell_bulgarian_split_squat'],
      ['barbell_bulgarian_split_squat'],
    ],
  },
  {
    name: 'lunge',
    steps: [
      ['reverse_lunge'],
      ['forward_lunge'],
      ['walking_lunge'],
      ['jumping_lunge'],
    ],
  },
  {
    name: 'step-up',
    steps: [['step_up'], ['dumbbell_step_up'], ['barbell_step_up']],
  },
  {
    name: 'wall sit',
    steps: [['wall_sit'], ['single_leg_wall_sit', 'weighted_wall_sit']],
  },
  // ── Hinge family ──────────────────────────────────────────────────────
  {
    name: 'deadlift',
    steps: [
      ['kettlebell_deadlift', 'dumbbell_deadlift'],
      ['trap_bar_deadlift'],
      ['conventional_deadlift'],
    ],
  },
  {
    name: 'romanian deadlift',
    steps: [['dumbbell_romanian_deadlift'], ['barbell_romanian_deadlift']],
  },
  {
    name: 'glute bridge',
    steps: [
      ['glute_bridge'],
      ['single_leg_glute_bridge', 'dumbbell_glute_bridge'],
      ['barbell_glute_bridge'],
      ['barbell_hip_thrust'],
    ],
  },
  {
    name: 'hip thrust',
    steps: [
      ['bodyweight_hip_thrust'],
      ['dumbbell_hip_thrust'],
      ['barbell_hip_thrust'],
    ],
  },
  {
    name: 'back extension',
    steps: [
      ['superman_hold'],
      ['hyperextension_back_extension'],
      ['weighted_back_extension'],
    ],
  },
  // ── Hamstrings ────────────────────────────────────────────────────────
  {
    name: 'nordic curl',
    steps: [['assisted_nordic_hamstring_curl'], ['nordic_hamstring_curl']],
  },
  {
    name: 'reverse nordic',
    steps: [
      ['assisted_reverse_nordic_curl'],
      ['reverse_nordic_curl'],
      ['weighted_reverse_nordic_curl'],
    ],
  },
  {
    name: 'slider leg curl',
    steps: [['slider_leg_curl'], ['single_leg_slider_leg_curl']],
  },
  {
    name: 'ball leg curl',
    steps: [
      ['stability_ball_leg_curl'],
      ['single_leg_stability_ball_leg_curl'],
    ],
  },
  // ── Bench press path ──────────────────────────────────────────────────
  {
    name: 'horizontal press',
    steps: [
      ['dumbbell_floor_press'],
      ['flat_dumbbell_bench_press'],
      ['flat_barbell_bench_press'],
    ],
  },
  // ── Core ──────────────────────────────────────────────────────────────
  {
    name: 'plank',
    steps: [
      ['front_plank'],
      ['long_lever_plank', 'rkc_plank', 'weighted_plank'],
    ],
  },
  {
    name: 'side plank',
    steps: [['side_plank'], ['side_plank_top_leg_raise', 'star_side_plank']],
  },
  {
    name: 'copenhagen plank',
    steps: [['copenhagen_knee_plank'], ['copenhagen_plank']],
  },
  {
    name: 'rollout',
    steps: [
      ['stability_ball_rollout'],
      ['ab_wheel_rollout'],
      ['standing_ab_wheel_rollout'],
    ],
  },
  {
    name: 'hanging abs',
    steps: [
      ['lying_leg_raise'],
      ['hanging_knee_raise'],
      ['hanging_leg_raise'],
      ['toes_to_bar'],
    ],
  },
  {
    name: 'hollow body',
    steps: [
      ['tuck_hollow_hold'],
      ['hollow_body_hold'],
      ['hollow_body_rock'],
      ['dragon_flag'],
    ],
  },
  {
    name: 'l-sit',
    steps: [['pull_up_bar_hang_knee_tuck'], ['hanging_l_sit'], ['front_lever']],
  },
  {
    name: 'turkish get-up',
    steps: [['half_turkish_get_up'], ['turkish_get_up']],
  },
  // ── Conditioning skill ────────────────────────────────────────────────
  {
    name: 'jump rope',
    steps: [['jump_rope_single_under'], ['jump_rope_double_under']],
  },
];

export interface ExerciseProgressions {
  easier: string[];
  harder: string[];
}

const PROGRESSION_INDEX: Map<string, ExerciseProgressions> = (() => {
  const index = new Map<string, ExerciseProgressions>();
  const entry = (id: string): ExerciseProgressions => {
    let e = index.get(id);
    if (!e) {
      e = { easier: [], harder: [] };
      index.set(id, e);
    }
    return e;
  };
  const push = (list: string[], ids: string[]) => {
    for (const id of ids) if (!list.includes(id)) list.push(id);
  };
  for (const ladder of PROGRESSION_LADDERS) {
    for (let i = 0; i < ladder.steps.length; i++) {
      for (const id of ladder.steps[i]) {
        if (i > 0) push(entry(id).easier, ladder.steps[i - 1]);
        if (i < ladder.steps.length - 1)
          push(entry(id).harder, ladder.steps[i + 1]);
      }
    }
  }
  return index;
})();

/** Easier/harder neighbors for an exercise, or undefined when it is not on any ladder. */
export function getExerciseProgressions(
  id: string,
): ExerciseProgressions | undefined {
  return PROGRESSION_INDEX.get(id);
}
