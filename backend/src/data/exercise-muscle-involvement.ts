import {
  BODY_REGIONS_BY_SUB,
  DETAIL_ONLY_REGIONS,
  SUB_OF_REGION,
} from './muscle-regions';
import { SUB_MUSCLE_MAP } from './exercise-mappings';

/**
 * Which anatomical regions an exercise works, and how much — the "retag".
 *
 * The catalog carries primaries as sub-muscles ("Upper Chest") and secondaries
 * as whole groups ("arms"). That is enough to name a muscle but not enough to
 * say the incline press works the triceps rather than the biceps, or that a leg
 * curl leans on the inner hamstring while a Romanian deadlift leans on the
 * outer. This module resolves both from the row's movement patterns and name:
 *
 * - Primaries expand to the regions of their sub-muscle, with EMPHASIS weights
 *   only where the evidence is solid (knee flexion vs hinge for hamstrings,
 *   seated vs standing calves, overhead vs pushdown triceps, extension vs squat
 *   quads, abduction for glute med). Everywhere else every head of the muscle
 *   gets the same weight, which is the honest default.
 * - Secondaries resolve from group + movement family to specific muscles
 *   (push -> triceps + front delts; pull -> biceps, forearms, rear delts;
 *   squat/hinge -> lower back + bracing core) at half weight or less. A region
 *   that is already a primary is never also a secondary.
 *
 * Output is per REGION (the figure's anatomical names), which is what the
 * body map, the exercise page and the recovery model all consume.
 */

export type MuscleRole = 'primary' | 'secondary';

export interface MuscleInvolvement {
  /** Anatomical region key on the figure ("Semitendinosus"). */
  region: string;
  /** Catalog sub-muscle the region belongs to ("Hamstrings"); null for detail-only regions. */
  sub: string | null;
  role: MuscleRole;
  /** 0..1. Primaries 0.6–1 (emphasis), secondaries 0.2–0.5. */
  weight: number;
}

export interface InvolvementSource {
  name?: string;
  primaryMuscleGroupId?: string;
  subMuscleIds?: string[];
  secondaryMuscleGroupIds?: string[];
  movementPatternIds?: string[];
}

// ---------------------------------------------------------------------------
// Movement families: the ~400 catalog pattern ids collapse into a few dozen
// families the rules can reason about. A row can be in several families.
// ---------------------------------------------------------------------------

export type Family =
  | 'push_h'
  | 'push_incline'
  | 'push_decline'
  | 'push_v'
  | 'lateral_raise'
  | 'rear_delt'
  | 'tri_overhead'
  | 'tri_ext'
  | 'curl'
  | 'curl_hammer'
  | 'curl_incline'
  | 'curl_preacher'
  | 'wrist_flex'
  | 'wrist_ext'
  | 'forearm_rot'
  | 'grip'
  | 'pull_v'
  | 'pull_h'
  | 'pullover'
  | 'shrug'
  | 'hinge'
  | 'squat'
  | 'knee_flex'
  | 'knee_ext'
  | 'plantar'
  | 'dorsi'
  | 'hip_abd'
  | 'hip_add'
  | 'core_flex'
  | 'core_lower'
  | 'core_anti_ext'
  | 'core_rot'
  | 'carry'
  | 'cuff'
  | 'cardio';

const PATTERN_FAMILIES: [Family, RegExp][] = [
  ['push_incline', /^(incline_push|incline_adduction)$/],
  [
    'push_decline',
    /^(decline_push|decline_adduction|dip|machine_dip|assisted_dip|bench_dip)$/,
  ],
  [
    'push_h',
    /^(horizontal_push|bench_press|floor_press|push_up|compound_press|horizontal_adduction|bodyweight_press|reverse_grip_press)$/,
  ],
  [
    'push_v',
    /^(vertical_press|overhead_press|push_press|landmine_press|shoulder_flexion|scaption|front_raise|y_raise|rotation_press|single_arm_press)$/,
  ],
  ['lateral_raise', /^(lateral_raise|shoulder_abduction|upright_row)$/],
  [
    'rear_delt',
    /^(face_pull|reverse_fly|rear_delt_row|trap_3_raise|face_pull_external_rotation|horizontal_abduction_external_rotation)$/,
  ],
  [
    'tri_overhead',
    /^(overhead_extension|single_arm_overhead_extension|machine_overhead_extension|long_head_extension|pullover_extension|single_arm_pullover_extension|incline_extension|lying_extension|single_arm_lying_extension|alternating_lying_extension|skull_crusher|decline_extension|floor_extension|single_arm_floor_extension|rolling_extension|single_arm_rolling_extension)$/,
  ],
  [
    'tri_ext',
    /^(pushdown|elbow_extension|reverse_grip_pushdown|single_arm_pushdown|cross_body_pushdown|independent_arm_extension|band_pushdown|kneeling_pushdown|press_away|single_arm_extension|band_press_away|cable_extension|band_extension|cross_body_extension|neutral_grip_extension|kickback|supported_extension|machine_extension|lever_extension|bodyweight_extension|unstable_extension|tate_press|jm_press)$/,
  ],
  ['curl_hammer', /^(hammer_curl|reverse_curl|zottman_curl|cross_body_curl)$/],
  ['curl_incline', /^(incline_curl)$/],
  ['curl_preacher', /^(preacher_curl|spider_curl|concentration_curl)$/],
  [
    'curl',
    /^(curl|elbow_flexion|alternating_curl|single_arm_curl|stability_curl|waiter_curl|band_curl|cable_curl|supinating_curl|drag_curl|behind_body_curl|strict_curl|machine_curl|chest_supported_curl|high_cable_curl|seated_cable_curl|seated_curl|kneeling_curl|lying_curl|arm_blaster_curl)$/,
  ],
  [
    'wrist_flex',
    /^(wrist_flexion|single_arm_wrist_flexion|cable_wrist_curl|band_wrist_curl|machine_wrist_flexion|finger_curl|single_arm_finger_curl)$/,
  ],
  [
    'wrist_ext',
    /^(wrist_extension|single_arm_wrist_extension|cable_wrist_extension|band_wrist_extension|machine_wrist_extension|finger_extension)$/,
  ],
  [
    'forearm_rot',
    /^(pronation|supination|lever_rotation|radial_deviation|ulnar_deviation|wrist_roller|cable_wrist_work|wrist_wrench_lift|wrist_wrench_hold|wrist_stability)$/,
  ],
  [
    'grip',
    /^(crush_grip|pinch_carry|pinch_hold|pinch_lift|hang|single_arm_hang|flexed_arm_hang|support_hold|thick_bar_grip|thick_handle_grip|thick_handle_carry|open_hand_grip|hub_lift|hub_hold|blob_lift|blob_hold|rolling_handle_lift|rolling_handle_hold|axle_hold|grip_lift|gripper_close|gripper_hold|static_pull|rim_hold|levering|front_lever|rear_lever|front_lever_hold|rear_lever_hold|towel_grip|towel_carry|rope_grip|cable_grip_work|hand_endurance|static_hold)$/,
  ],
  ['pull_v', /^(vertical_pull|pull_up|band_pulldown)$/],
  ['pull_h', /^(horizontal_pull|row)$/],
  ['pullover', /^(pullover)$/],
  ['shrug', /^(scapular_elevation)$/],
  [
    'hinge',
    /^(hinge|hip_hinge|deadlift|good_morning|single_leg_hinge|back_extension|pull_through|hip_extension|hip_thrust|glute_bridge|bridge)$/,
  ],
  [
    'squat',
    /^(squat|hack_squat|split_squat|single_leg_squat|leg_press|isometric_squat|lunge|step_up|step_down|sled_drag)$/,
  ],
  ['knee_flex', /^(leg_curl)$/],
  ['knee_ext', /^(leg_extension|knee_extension|sissy_squat)$/],
  ['plantar', /^(plantar_flexion)$/],
  ['dorsi', /^(dorsiflexion)$/],
  ['hip_abd', /^(hip_abduction)$/],
  ['hip_add', /^(hip_adduction|copenhagen_plank)$/],
  [
    'core_flex',
    /^(crunch|spinal_flexion|loaded_flexion|cable_crunch|machine_crunch|toe_reach|sit_up|anchored_sit_up|decline_flexion|extended_range_flexion|v_up|simultaneous_raise|loaded_raise|alternating_v_up|cross_body_flexion|jackknife|tuck_up|cable_flexion|suspension_crunch)$/,
  ],
  [
    'core_lower',
    /^(knee_tuck|hip_flexion|knee_raise|plank_tuck|unstable_tuck|suspension_tuck|reverse_crunch|pelvic_tilt|garhammer_raise|leg_raise|hip_raise|leg_lower|alternating_leg_lower|hanging_knee_raise|hanging_leg_raise|toes_to_bar|hanging_raise|supported_knee_raise|supported_leg_raise|flutter_kick|scissor_kick|hollow_hold|hollow_rock|tuck_position|dragon_flag|l_sit|dead_bug|in_and_out|tuck_extension|vertical_leg_flexion|pike|tabletop_march|toe_tap|single_leg_control|eccentric_control)$/,
  ],
  [
    'core_anti_ext',
    /^(anti_extension|plank|brace|high_tension_brace|rollout|standing_rollout|fallout|body_saw|walkout|bear_plank|bear_crawl|bear_position|stir_the_pot|long_lever|unstable_support|shoulder_tap|suspension|drag|hover|isometric_hold|isometric|breathing|pelvic_control|diaphragmatic_control|locomotion|reverse_locomotion|lateral_locomotion|bird_dog|turkish_get_up|half_get_up|arm_bar|windmill|shoulder_stability|cross_body_stability|short_lever)$/,
  ],
  [
    'core_rot',
    /^(rotation|anti_rotation|side_plank|side_flexion|side_crunch|side_sit_up|side_jackknife|side_v_up|side_bend|side_plank_tuck|anti_lateral_flexion|oblique_reach|oblique_crunch|oblique_slam|windshield_wiper|hanging_windshield_wiper|russian_twist|loaded_rotation|landmine_rotation|landmine_180|wood_chop|cable_lift|band_lift|pallof_press|pallof_hold|pallof_walkout|halo|bicycle_crunch|cross_body_mountain_climber|cross_body_sit_up|rotational_sit_up|rotational_v_up|hanging_oblique_raise|hanging_hip_raise|supported_hip_raise|machine_rotation|machine_oblique_crunch|star_position|hip_dip|top_leg_raise|split_stance|cable_rotation|band_rotation)$/,
  ],
  [
    'carry',
    /^(farmer_carry|loaded_carry|trap_bar_carry|suitcase_carry|bottoms_up_carry|waiter_carry|shoulder_carry|offset_front_rack_carry|offset_carry|front_rack_carry|overhead_carry|bear_hug_carry|zercher_carry|front_carry|suitcase_hold|front_rack_hold|overhead_hold|trap_bar_hold|bear_hug_hold|bottoms_up_hold|suitcase_march|front_rack_march|overhead_march|march|bottoms_up_march|zercher_march|gait)$/,
  ],
  [
    'cuff',
    /^(external_rotation|internal_rotation|cuban_rotation|scarecrow_external_rotation|isometric_rotation|scapular_stability|lift_off|serratus_punch|closed_chain_stability)$/,
  ],
  ['cardio', /^(cardio|jump|explosive)$/],
];

const NAME_FAMILIES: [Family, RegExp][] = [
  ['knee_flex', /leg curl|nordic|glute[- ]ham|\bghr\b/],
  [
    'hinge',
    /deadlift|\brdl\b|romanian|good morning|swing|hip thrust|glute bridge|back extension|hyperextension|reverse hyper|clean\b|snatch\b/,
  ],
  ['squat', /squat|lunge|leg press|step[- ]up|step[- ]down|sled/],
  ['knee_ext', /leg extension|sissy/],
  ['push_incline', /incline .*(press|fly|flye|push)/],
  ['push_decline', /decline .*(press|fly|flye|push)|\bdips?\b/],
  [
    'push_v',
    /overhead press|shoulder press|military press|arnold press|z press|landmine press|pike push|handstand/,
  ],
  [
    'tri_overhead',
    /overhead .*extension|skull ?crusher|french press|lying .*extension/,
  ],
  ['curl_hammer', /hammer curl|reverse curl|zottman|cross[- ]body curl/],
  ['pull_v', /pull[- ]?ups?|chin[- ]?ups?|pulldown/],
  ['pull_h', /\brow\b|\brows\b/],
  ['shrug', /shrug/],
];

/** Families a row belongs to, from its pattern ids and (as a backstop) its name. */
export function familiesOf(src: InvolvementSource): Set<Family> {
  const out = new Set<Family>();
  for (const id of src.movementPatternIds ?? []) {
    for (const [fam, re] of PATTERN_FAMILIES) if (re.test(id)) out.add(fam);
  }
  const name = (src.name ?? '').toLowerCase();
  for (const [fam, re] of NAME_FAMILIES) if (re.test(name)) out.add(fam);
  // "upright row" is a shoulder/trap move, never a back row
  if (/upright row/.test(name)) {
    out.delete('pull_h');
    out.add('lateral_raise');
  }
  return out;
}

const isPush = (f: Set<Family>) =>
  f.has('push_h') ||
  f.has('push_incline') ||
  f.has('push_decline') ||
  f.has('push_v') ||
  f.has('tri_ext') ||
  f.has('tri_overhead');
const isPull = (f: Set<Family>) =>
  f.has('pull_v') ||
  f.has('pull_h') ||
  f.has('curl') ||
  f.has('curl_hammer') ||
  f.has('curl_incline') ||
  f.has('curl_preacher') ||
  f.has('pullover') ||
  f.has('rear_delt');
// ---------------------------------------------------------------------------
// Primary emphasis: sub-muscle -> region weights, by family and name.
// ---------------------------------------------------------------------------

function primaryWeights(
  sub: string,
  fam: Set<Family>,
  name: string,
): Map<string, number> {
  const regions = BODY_REGIONS_BY_SUB[sub] ?? [];
  const even = new Map(regions.map((r) => [r, 1] as [string, number]));
  const w = (pairs: [string, number][]) => new Map(pairs);
  switch (sub) {
    case 'Hamstrings':
      if (fam.has('knee_flex'))
        return w([
          ['Semitendinosus', 1],
          ['Biceps Femoris', 0.6],
        ]);
      if (fam.has('hinge'))
        return w([
          ['Biceps Femoris', 1],
          ['Semitendinosus', 0.7],
        ]);
      return even;
    case 'Quads':
      if (fam.has('knee_ext'))
        return w([
          ['Rectus Femoris', 1],
          ['Vastus Lateralis', 0.8],
          ['Vastus Medialis', 0.8],
        ]);
      if (fam.has('squat'))
        return w([
          ['Vastus Lateralis', 1],
          ['Vastus Medialis', 1],
          ['Rectus Femoris', 0.6],
        ]);
      return even;
    case 'Calves':
      if (/seated|bent[- ]knee/.test(name))
        return w([
          ['Soleus', 1],
          ['Gastrocnemius', 0.4],
          ['Gastrocnemius (medial)', 0.4],
          ['Gastrocnemius (lateral)', 0.4],
        ]);
      return w([
        ['Gastrocnemius', 1],
        ['Gastrocnemius (medial)', 1],
        ['Gastrocnemius (lateral)', 1],
        ['Soleus', 0.5],
      ]);
    case 'Triceps':
      if (fam.has('tri_overhead'))
        return w([
          ['Triceps (long head)', 1],
          ['Triceps (lateral head)', 0.7],
          ['Triceps (medial head)', 0.7],
        ]);
      if (fam.has('tri_ext'))
        return w([
          ['Triceps (lateral head)', 1],
          ['Triceps (medial head)', 1],
          ['Triceps (long head)', 0.6],
        ]);
      return even;
    case 'Biceps':
      if (fam.has('curl_hammer'))
        return w([
          ['Brachialis', 1],
          ['Biceps (long head)', 0.6],
          ['Biceps (short head)', 0.6],
        ]);
      if (fam.has('curl_incline'))
        return w([
          ['Biceps (long head)', 1],
          ['Biceps (short head)', 0.8],
          ['Brachialis', 0.5],
        ]);
      if (fam.has('curl_preacher'))
        return w([
          ['Biceps (short head)', 1],
          ['Biceps (long head)', 0.8],
          ['Brachialis', 0.5],
        ]);
      return w([
        ['Biceps (long head)', 1],
        ['Biceps (short head)', 1],
        ['Brachialis', 0.6],
      ]);
    case 'Forearms':
      if (fam.has('wrist_flex') || fam.has('grip'))
        return w([
          ['Wrist Flexors', 1],
          ['Flexor Carpi Ulnaris', 0.8],
          ['Brachioradialis', 0.4],
        ]);
      if (fam.has('wrist_ext'))
        return w([
          ['Wrist Extensors', 1],
          ['Brachioradialis', 0.4],
        ]);
      if (fam.has('forearm_rot') || fam.has('curl_hammer'))
        return w([
          ['Brachioradialis', 1],
          ['Wrist Flexors', 0.6],
          ['Wrist Extensors', 0.6],
        ]);
      return even;
    case 'Lats':
      return w([
        ['Lats', 1],
        ['Teres Major', fam.has('pull_v') ? 0.8 : 0.6],
      ]);
    case 'Glutes':
      if (fam.has('hip_abd')) return w([['Glute Max', 0.6]]);
      return even;
    case 'Outer Thighs':
      return w([
        ['Glute Med', 1],
        ['TFL', 0.7],
      ]);
    case 'Inner Thighs':
      return w([
        ['Adductors', 1],
        ['Adductor Magnus', 0.8],
        ['Gracilis', 0.6],
      ]);
    default:
      return even;
  }
}

// ---------------------------------------------------------------------------
// Secondary resolution: group id -> sub-muscles with weights, by family.
// ---------------------------------------------------------------------------

function secondarySubs(group: string, fam: Set<Family>): [string, number][] {
  switch (group) {
    case 'arms':
      if (isPush(fam)) return [['Triceps', 0.5]];
      if (isPull(fam) || fam.has('shrug'))
        return [
          ['Biceps', 0.5],
          ['Forearms', 0.4],
        ];
      if (
        fam.has('hinge') ||
        fam.has('carry') ||
        fam.has('grip') ||
        fam.has('lateral_raise')
      )
        return [['Forearms', 0.4]];
      if (fam.has('cardio'))
        return [
          ['Biceps', 0.25],
          ['Triceps', 0.25],
        ];
      return [['Forearms', 0.3]];
    case 'shoulders':
      if (fam.has('push_incline') || fam.has('push_h'))
        return [['Front Delts', 0.5]];
      if (fam.has('push_decline')) return [['Front Delts', 0.4]];
      if (fam.has('push_v'))
        return [
          ['Side Delts', 0.5],
          ['Front Delts', 0.4],
        ];
      if (fam.has('tri_ext') || fam.has('tri_overhead'))
        return [['Front Delts', 0.25]];
      if (
        fam.has('pull_h') ||
        fam.has('pull_v') ||
        fam.has('pullover') ||
        fam.has('shrug')
      )
        return [['Rear Delts', 0.5]];
      if (
        fam.has('curl') ||
        fam.has('curl_hammer') ||
        fam.has('curl_incline') ||
        fam.has('curl_preacher')
      )
        return [['Front Delts', 0.25]];
      if (fam.has('lateral_raise')) return [['Front Delts', 0.4]];
      if (fam.has('hinge') || fam.has('cardio')) return [['Rear Delts', 0.3]];
      if (fam.has('carry'))
        return [
          ['Side Delts', 0.3],
          ['Rotator Cuff', 0.3],
        ];
      return [['Front Delts', 0.3]];
    case 'back':
      if (
        fam.has('squat') ||
        fam.has('hinge') ||
        fam.has('carry') ||
        fam.has('core_rot') ||
        fam.has('core_flex')
      )
        return [['Lower Back', 0.5]];
      if (isPull(fam) || fam.has('grip'))
        return [
          ['Upper Back', 0.5],
          ['Lats', 0.3],
        ];
      if (fam.has('cuff') || fam.has('lateral_raise'))
        return [['Upper Back', 0.4]];
      if (fam.has('core_anti_ext') || fam.has('core_lower'))
        return [['Lower Back', 0.3]];
      return [['Lower Back', 0.4]];
    case 'core':
      if (fam.has('core_rot')) return [['Obliques', 0.5]];
      if (
        fam.has('squat') ||
        fam.has('hinge') ||
        fam.has('carry') ||
        fam.has('push_v') ||
        isPull(fam)
      )
        return [
          ['Upper Abs', 0.4],
          ['Obliques', 0.4],
        ];
      if (
        fam.has('knee_flex') ||
        fam.has('plantar') ||
        fam.has('hip_add') ||
        fam.has('hip_abd') ||
        fam.has('knee_ext')
      )
        return [['Lower Abs', 0.2]];
      if (isPush(fam) || fam.has('lateral_raise') || fam.has('rear_delt'))
        return [
          ['Upper Abs', 0.25],
          ['Obliques', 0.25],
        ];
      return [
        ['Upper Abs', 0.35],
        ['Obliques', 0.3],
      ];
    case 'legs':
      if (fam.has('hinge'))
        return [
          ['Glutes', 0.5],
          ['Hamstrings', 0.5],
        ];
      if (fam.has('squat'))
        return [
          ['Quads', 0.5],
          ['Glutes', 0.5],
        ];
      if (fam.has('core_lower') || fam.has('core_flex'))
        return [['Quads', 0.3]];
      if (fam.has('carry'))
        return [
          ['Quads', 0.3],
          ['Calves', 0.3],
        ];
      if (fam.has('cardio'))
        return [
          ['Quads', 0.4],
          ['Calves', 0.4],
          ['Glutes', 0.3],
        ];
      if (fam.has('core_rot') || fam.has('core_anti_ext'))
        return [['Outer Thighs', 0.25]];
      return [['Glutes', 0.35]];
    case 'chest':
      if (fam.has('push_decline')) return [['Lower Chest', 0.5]];
      if (fam.has('push_incline')) return [['Upper Chest', 0.5]];
      if (
        fam.has('tri_ext') ||
        fam.has('tri_overhead') ||
        isPush(fam) ||
        fam.has('pullover')
      )
        return [['Mid Chest', 0.4]];
      return [['Mid Chest', 0.35]];
    default:
      return [];
  }
}

/** Secondary weights spread over a sub-muscle's regions: even, no emphasis guesses. */
function secondaryRegions(sub: string, weight: number): [string, number][] {
  const regions = BODY_REGIONS_BY_SUB[sub] ?? [];
  // A sub with many small parts (forearm compartments, calves) shares the weight a little.
  const w = regions.length >= 4 ? weight * 0.85 : weight;
  return regions.map((r) => [r, w] as [string, number]);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Region-level involvement for one catalog row. Cardio/unknown rows yield []. */
export function involvementFor(src: InvolvementSource): MuscleInvolvement[] {
  const fam = familiesOf(src);
  const name = (src.name ?? '').toLowerCase();
  const primaries = new Map<string, number>();

  const subs = (src.subMuscleIds ?? [])
    .map((id) => SUB_MUSCLE_MAP[id])
    .filter((s): s is string => !!s);
  if (subs.length === 0 && src.primaryMuscleGroupId) {
    // Legacy rows without sub-muscles: the whole group, evenly.
    const group = src.primaryMuscleGroupId.toLowerCase();
    for (const [sub, g] of Object.entries(GROUP_OF_SUB_LOWER))
      if (g === group) subs.push(sub);
  }
  for (const sub of new Set(subs)) {
    for (const [region, weight] of primaryWeights(sub, fam, name)) {
      primaries.set(region, Math.max(primaries.get(region) ?? 0, weight));
    }
  }
  // Detail-only regions the rules can name directly.
  if (fam.has('dorsi')) primaries.set('Tibialis Anterior', 1);

  const secondaries = new Map<string, number>();
  for (const group of src.secondaryMuscleGroupIds ?? []) {
    for (const [sub, weight] of secondarySubs(group.toLowerCase(), fam)) {
      for (const [region, w] of secondaryRegions(sub, weight)) {
        if (primaries.has(region)) continue;
        secondaries.set(region, Math.max(secondaries.get(region) ?? 0, w));
      }
    }
  }

  const out: MuscleInvolvement[] = [];
  for (const [region, weight] of primaries) {
    out.push({
      region,
      sub: SUB_OF_REGION[region] ?? null,
      role: 'primary',
      weight: round2(weight),
    });
  }
  for (const [region, weight] of secondaries) {
    out.push({
      region,
      sub: SUB_OF_REGION[region] ?? null,
      role: 'secondary',
      weight: round2(weight),
    });
  }
  out.sort((a, b) =>
    a.role === b.role
      ? b.weight - a.weight || a.region.localeCompare(b.region)
      : a.role === 'primary'
        ? -1
        : 1,
  );
  return out;
}

// group per sub, lowercase group ids as the raw rows spell them
const GROUP_OF_SUB_LOWER: Record<string, string> = {
  Traps: 'back',
  'Upper Back': 'back',
  'Mid Back': 'back',
  'Lower Back': 'back',
  Lats: 'back',
  'Front Delts': 'shoulders',
  'Side Delts': 'shoulders',
  'Rear Delts': 'shoulders',
  'Rotator Cuff': 'shoulders',
  'Upper Chest': 'chest',
  'Mid Chest': 'chest',
  'Lower Chest': 'chest',
  'Upper Abs': 'core',
  'Lower Abs': 'core',
  Obliques: 'core',
  Biceps: 'arms',
  Triceps: 'arms',
  Forearms: 'arms',
  Quads: 'legs',
  Hamstrings: 'legs',
  Glutes: 'legs',
  'Outer Thighs': 'legs',
  'Inner Thighs': 'legs',
  Calves: 'legs',
};

/** Every region name the module can emit — for the sync test against the client asset. */
export const INVOLVEMENT_REGIONS: string[] = [
  ...new Set([
    ...Object.values(BODY_REGIONS_BY_SUB).flat(),
    ...DETAIL_ONLY_REGIONS,
  ]),
];
