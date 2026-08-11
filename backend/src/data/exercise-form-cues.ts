/**
 * Form cues: the common mistakes for an exercise, each with the fix
 * (catalog follow-up, 2026-08-11).
 *
 * Shown on the exercise detail screen as a "Watch Out For" list — the
 * coaching layer instructions can't carry: what people get wrong.
 *
 * STYLE: 1–4 cues per row. Each cue is one sentence, led by the mistake
 * (usually a gerund phrase), with the correction after a semicolon when
 * it isn't obvious. Plain language, no em-dashes, ends with a period.
 * Mistakes genuinely shared across a movement family may repeat between
 * sibling rows, but implement-specific failure modes get their own cue.
 *
 * SCOPE: S/A/B tier rows only (the exercises users actually meet in
 * plans, browse tops, and replacements — 544 rows). The C/D tail is
 * mostly the PT/prehab matrix and redundant variants; cue coverage there
 * adds little. Authored one muscle group at a time; a group listed in
 * CUE_COMPLETED_GROUPS must have every S/A/B row covered (spec-enforced).
 *
 * Consumed by GET /exercises/:id. Generation does not read this file.
 */

/** Groups whose S/A/B rows are fully covered. Grown one slice at a time. */
export const CUE_COMPLETED_GROUPS: string[] = [
  'chest',
  'cardio',
  'shoulders',
  'arms',
  'core',
  'back',
];

export const FORM_CUES: Record<string, string[]> = {
  // ─── chest (41) ───────────────────────────────────────────────────────
  flat_barbell_bench_press: [
    'Bouncing the bar off your chest; touch lightly and press with control.',
    'Elbows flaring straight out to the sides; keep them around 45 degrees from your torso.',
    'Feet dancing or heels lifting; plant them and keep tension from the floor up.',
  ],
  incline_barbell_bench_press: [
    'Setting the incline too steep; past about 45 degrees the front delts take over.',
    'Bouncing the bar off your upper chest.',
    'Arching your lower back off the bench to flatten the angle.',
  ],
  decline_barbell_bench_press: [
    'Cutting the range short; the shorter path makes half reps tempting.',
    'Losing control with the bar over your face and neck; use a spotter or safety catches.',
  ],
  wide_grip_bench_press: [
    'Going so wide your shoulders strain at the bottom; widen only slightly beyond your normal grip.',
    'Flaring the elbows fully; even with a wide grip keep a slight tuck.',
  ],
  floor_press: [
    'Bouncing your triceps off the floor; pause softly at the bottom.',
    'Bridging your hips up to press more weight; keep your glutes down.',
  ],
  smith_machine_bench_press: [
    'Lying where the fixed path puts the bar over your neck or belly; position so it touches mid chest.',
    'Letting the machine do the balance work; keep your shoulder blades pinned like a free-weight press.',
  ],
  smith_machine_incline_bench_press: [
    'Bench placed so the fixed path sends the bar to your collarbones; it should meet your upper chest.',
    'Setting the incline too steep and turning it into a shoulder press.',
  ],
  incline_dumbbell_bench_press: [
    'Starting with the dumbbells too far apart; press up and slightly together.',
    'Arching your lower back to flatten the incline; keep your ribs down.',
    'Dropping into the deep stretch faster than your shoulders can control.',
  ],
  flat_dumbbell_bench_press: [
    'Clanging the dumbbells together at the top; stop just short of touching.',
    'Letting the weights drift toward your face; keep them over your chest.',
    'Twisting heavy dumbbells into place; kick them up with your knees instead.',
  ],
  decline_dumbbell_bench_press: [
    'Losing shoulder control getting in and out of position; go lighter than your flat press.',
    'Half reps through the shortened range; take the full path.',
  ],
  neutral_grip_dumbbell_press: [
    'Letting the elbows drift wide, which defeats the shoulder-friendly grip; keep them tracking close.',
    'Pressing unevenly; the neutral grip hides one side working harder.',
  ],
  dumbbell_squeeze_press: [
    'Letting the dumbbells separate mid press; the squeeze is the exercise.',
    'Rushing the reps; press slowly to keep constant tension.',
  ],
  dumbbell_floor_press: [
    'Bouncing your upper arms off the floor; touch down softly and pause.',
    'Arching your hips off the ground to cheat the press.',
  ],
  single_arm_dumbbell_press: [
    'Letting your torso twist toward the working arm; brace and stay square.',
    'Rushing the reps; fighting the twist is half the exercise.',
  ],
  kettlebell_floor_press: [
    'Letting the bell fold your wrist backward; keep the wrist stacked and knuckles up.',
    'Flaring the elbow away from your ribs at the bottom.',
  ],
  machine_chest_press: [
    'Seat set so the handles sit at your shoulders or belly; align them with mid chest.',
    'Letting the weight stack slam between reps; stop just before it touches.',
  ],
  incline_machine_chest_press: [
    'Seat set too low, turning it into a shoulder press; the handles should meet your upper chest.',
    'Shrugging your shoulders up as you press.',
  ],
  decline_machine_chest_press: [
    'Short-stroking the shortened range; take the handles through the full path.',
    'Letting your shoulders roll forward off the pad at the bottom.',
  ],
  cable_chest_press: [
    'Standing square with no stagger; split your stance so the cables cannot pull you backward.',
    'Letting your shoulders roll forward at the end of the press.',
  ],
  incline_cable_chest_press: [
    'Pulleys out of line with your upper chest; set the bench and cables before loading.',
    'Letting the cables yank your arms back into the stretch; control the return.',
  ],
  cable_single_arm_press: [
    'Letting the cable rotate your torso; brace like a one-arm plank.',
    'Standing tall with feet square; take a split stance for balance.',
  ],
  resistance_band_chest_press: [
    'Anchoring the band above or below chest height so it drags your pressing line; keep it at mid chest.',
    'Letting the band snap your arms back; the slow return is the best part.',
  ],
  trx_chest_press: [
    'Sagging hips; keep a straight plank line from head to heels.',
    'Walking your feet further back than you are ready for; steeper is harder.',
  ],
  flat_dumbbell_fly: [
    'Turning it into a press by bending the elbows more as you tire; keep a fixed soft bend.',
    'Dropping too deep into the stretch; stop where your chest, not your shoulder, holds the load.',
    'Going heavy; flies punish heavy weights.',
  ],
  pec_deck_fly: [
    'Seat set so your elbows sit well below your hands; upper arms should be near level.',
    'Letting the pads throw your arms back; control the return.',
  ],
  cable_crossover: [
    'Leaning further forward as you fatigue; set your lean and keep it.',
    'Letting the stacks yank your arms wide; control the negative.',
    'Stacking on weight; crossovers reward control, not load.',
  ],
  low_cable_fly: [
    'Turning the upward sweep into a front raise; drive your palms together, not up.',
    'Shrugging as you finish at the top.',
  ],
  mid_cable_fly: [
    'Drifting forward between reps; stagger your stance and stay planted.',
    'Bending the elbows into a press when it gets heavy.',
  ],
  cable_incline_fly: [
    'Cables losing tension at the bottom; line the pulleys up with your chest before you start.',
    'Collapsing the arc at the top; hold the fixed elbow bend all the way up.',
  ],
  incline_dumbbell_fly: [
    'Descending faster than your shoulders can control; the incline stretch is deep.',
    'Bending the elbows into a press; keep the arc fixed.',
  ],
  resistance_band_chest_fly: [
    'Starting where the band is slack; step forward until there is tension through the whole arc.',
    'Letting the band snap your arms open on the return.',
  ],
  push_up: [
    'Hips sagging or piking; hold one straight line from head to heels.',
    'Half reps; get your chest close to the floor each time.',
    'Hands wide with elbows flaring straight out; keep elbows around 45 degrees.',
  ],
  incline_push_up: [
    'Treating the incline as a rest; the plank rules still apply, hips level.',
    'Shrugging your shoulders toward your ears as you press.',
  ],
  knee_push_up: [
    'Bending at the hips; keep one straight line from head to knees.',
    'Rushing the reps instead of controlling the descent.',
  ],
  decline_push_up: [
    'Letting your head dive first; lead with your chest.',
    'Hips piking as the feet rise; squeeze your glutes to hold the line.',
  ],
  deficit_push_up: [
    'Dropping into the extra range without control; lower slowly.',
    'Shrugging at the bottom of the extended stretch.',
  ],
  weighted_push_up: [
    'Plate placed on your neck or lower back; center it over your mid back.',
    'Letting your hips sag under the extra load; brace harder than usual.',
  ],
  band_resisted_push_up: [
    'Band running across your neck; run it across your upper back and under your palms.',
    'Losing the lockout to band tension; finish every press fully.',
  ],
  ring_push_up: [
    'Letting the rings drift wide at the bottom; keep them close to your ribs.',
    'Sagging hips; the instability punishes a soft core.',
  ],
  chest_dip: [
    'Staying upright, which shifts the work to your triceps; lean your torso forward for chest.',
    'Dropping below what your shoulders can control; go as deep as feels strong.',
    'Flaring your elbows straight out.',
  ],
  weighted_chest_dip: [
    'Adding load before your bodyweight dips are rock solid.',
    'Letting the belt swing; control the descent to keep the weight quiet.',
  ],

  // ─── cardio (32) ──────────────────────────────────────────────────────
  treadmill_jog_steady: [
    'Holding the handrails; pump your arms instead.',
    'Overstriding out in front; land with your feet under your hips.',
    'Setting a pace you cannot hold; steady state should feel conversational.',
  ],
  stationary_bike_steady: [
    'Seat too low, which grinds your knees; set it so your leg is almost straight at the bottom.',
    'Mashing a big gear at a slow grind; keep a smooth 80 to 100 rpm.',
    'Slumping over the bars; keep your chest open.',
  ],
  rowing_machine_steady: [
    'Pulling with your arms first; the order is legs, then hips, then arms.',
    'Hunching your back at the catch; hinge tall from the hips.',
    'Cranking the damper to 10; a 3 to 5 setting rows smoother.',
  ],
  treadmill_walk_easy: [
    'Holding the rails and leaning back; walk tall with a natural arm swing.',
    'Strolling too slowly to count; keep a purposeful pace.',
  ],
  treadmill_incline_walk: [
    'Hanging on the handrails, which erases the incline; let go and shorten your steps.',
    'Leaning back against the slope; lean slightly into the hill.',
  ],
  stair_climber_machine: [
    'Locking your arms onto the rails and unloading your legs.',
    'Tiny toe taps; place your whole foot and push through your heel.',
  ],
  elliptical_steady: [
    'Letting momentum do the work; keep pressure through the pedals the whole stroke.',
    'Bouncing on your toes; stay flat-footed.',
  ],
  ski_erg_steady: [
    'Pulling with only your arms; crunch through your trunk and hinge at the hips.',
    'Standing stiff-legged; let your knees bend with each drive.',
  ],
  treadmill_run_intervals: [
    'Jumping to a sprint before the belt is at speed; ramp it up before you commit.',
    'Skipping the easy warm-up jog before the first hard rep.',
  ],
  stationary_bike_intervals: [
    'Sprinting with a bouncing hip rock; add resistance instead of just cadence.',
    'Coasting to a dead stop between reps; spin easy to recover.',
  ],
  rowing_machine_intervals: [
    'Letting form collapse when the split drops; hard intervals still go legs, hips, arms.',
    'Yanking the handle to your neck; pull to your lower ribs.',
  ],
  air_bike_assault: [
    'Pushing with arms only while your legs coast; drive both together.',
    'Starting the first interval at max effort; this bike punishes uneven pacing.',
  ],
  elliptical_intervals: [
    'Speeding up by bouncing instead of pushing; add resistance for the hard reps.',
    'Letting your heels float as the pace rises.',
  ],
  ski_erg_intervals: [
    'Shortening to arm-only strokes as you tire; keep the full hinge.',
    'Standing bolt upright between pulls and losing the rhythm.',
  ],
  outdoor_jog_steady: [
    'Starting too fast; settle into a pace you could talk through.',
    'Overstriding downhill; shorten your steps and stay light.',
  ],
  outdoor_run_intervals: [
    'Sprinting cold; jog easy before the first hard rep.',
    'Running hard reps where you cannot see traffic; pick a clear stretch first.',
  ],
  outdoor_cycling_steady: [
    'Grinding too big a gear; spin lighter and faster.',
    'Locking your elbows; keep them soft over bumps.',
  ],
  trail_hiking_brisk: [
    'Striding heel-first onto loose ground on descents; shorten your steps.',
    'Carrying gear in your hands; use a pack and keep your arms free.',
  ],
  swimming_laps_easy: [
    'Holding your breath; exhale steadily underwater.',
    'Lifting your head to breathe, which sinks your hips; rotate to the side instead.',
  ],
  burpee: [
    'Flopping your chest to the floor; lower with control.',
    'Skipping the plank and letting your hips sag mid rep.',
    'Landing the jump stiff-legged; soften your knees.',
  ],
  jump_rope_single_under: [
    'Jumping high; you only need an inch of clearance.',
    'Swinging from your shoulders; the wrists turn the rope.',
    'Landing flat-footed; stay on the balls of your feet.',
  ],
  mountain_climber_cardio: [
    'Hips riding up as you speed up; keep your plank flat.',
    'Shoulders drifting behind your wrists; keep them stacked.',
  ],
  jumping_jack: [
    'Landing stiff and flat; stay springy on the balls of your feet.',
    'Half arm swings; take your hands overhead each rep.',
  ],
  jump_squat_bodyweight: [
    'Landing with locked knees; absorb softly into the next squat.',
    'Cutting the squat short and just hopping; hit depth before takeoff.',
  ],
  jumping_lunge: [
    'Front knee caving inward on the landing; track it over your toes.',
    'Torso pitching forward as you fatigue; stop while your landings are quiet.',
  ],
  plyo_box_jump: [
    'Picking a box you have to crash-land on; land softly in a quarter squat.',
    'Jumping down off the box; step down and reset.',
  ],
  shadow_boxing_rounds: [
    'Dropping your hands between punches; return to guard.',
    'Punching with arms only; rotate your hips into each shot.',
  ],
  kettlebell_swing_conditioning: [
    'Squatting the swing; it is a hip hinge with a snap.',
    'Lifting the bell with your arms; your hips launch it.',
    'Rounding your back at the bottom; keep a flat spine.',
  ],
  sled_push: [
    'Pushing upright with straight arms; lean into the sled at about 45 degrees.',
    'Short choppy tiptoe steps; drive full steps through your whole foot.',
  ],
  medicine_ball_slam: [
    'Hinging only at the back to pick the ball up; squat down between slams.',
    'Slamming a bouncy ball at full power; it comes back at your face, use a dead ball.',
  ],
  wall_ball: [
    'Catching the ball with straight arms; absorb it into your squat.',
    'Throwing with arms only; the legs drive the ball up.',
    'Missing the target height when tired; shorten the set, not the throw.',
  ],
  battle_rope_alternating_waves: [
    'Standing tall and stiff; sit into a quarter squat.',
    'Making waves from your shoulders only; drive from your hips.',
    'White-knuckling the rope ends; hold firm but relaxed.',
  ],

  // ─── shoulders (70) ───────────────────────────────────────────────────
  // Overhead presses
  barbell_overhead_press: [
    'Leaning way back and turning it into an incline press; squeeze your glutes and keep your ribs down.',
    'Pressing the bar around your face; tuck your chin and push your head through at the top.',
    'Cutting the lockout short; finish with the bar over the back of your head.',
  ],
  seated_barbell_overhead_press: [
    'Arching hard off the backrest to press more weight; keep your back against the pad.',
    'Lowering only to eye level; bring the bar down near your collarbones.',
  ],
  dumbbell_shoulder_press: [
    'Arching your lower back as the weights go up; brace your core like a plank.',
    'Stopping short of lockout; press all the way up without shrugging.',
    'Letting the dumbbells drift forward; keep them stacked over your elbows.',
  ],
  seated_dumbbell_shoulder_press: [
    'Sliding down into the backrest so the press turns into an incline; sit tall against the pad.',
    'Clanging the weights overhead; stop just short of touching.',
    'Dropping your elbows far below 90 degrees and bouncing out of the bottom.',
  ],
  single_arm_dumbbell_shoulder_press: [
    'Leaning away from the working arm; brace and stay tall.',
    'Letting the weight drift out to the side; press straight up.',
  ],
  arnold_press: [
    'Rushing the rotation; turn the palms smoothly as you press, not all at once.',
    'Starting the twist with your elbows winged out; begin palms-in at shoulder height.',
  ],
  seated_arnold_press: [
    'Rushing the rotation; turn smoothly through the whole press.',
    'Arching off the backrest as the weight passes your head.',
  ],
  barbell_push_press: [
    'Turning the dip into a squat; it is a shallow, quick knee bend.',
    'Dipping forward onto your toes; keep the dip straight down through your heels.',
    'Pressing before the legs finish; let the drive launch the bar past your forehead.',
  ],
  dumbbell_push_press: [
    'A slow, deep dip; keep it short and snappy.',
    'Letting the dumbbells crash back down; lower with control between reps.',
  ],
  single_arm_dumbbell_push_press: [
    'Leaning sideways during the dip; keep your trunk vertical.',
    'Losing the rhythm of dip, drive, press; sequence it every rep.',
  ],
  kettlebell_overhead_press: [
    'Letting the bell fold your wrist back; keep your wrist straight and knuckles up.',
    'Pressing with the elbow flared wide; keep it under the bell.',
  ],
  single_arm_kettlebell_overhead_press: [
    'Leaning away from the bell; brace your side and stay tall.',
    'Letting the bell drag your arm behind your head at lockout.',
  ],
  kettlebell_push_press: [
    'Turning the dip into a slow squat; short and snappy wins.',
    'Letting the bell crash onto your forearm between reps; control the drop to the rack.',
  ],
  seated_machine_shoulder_press: [
    'Seat set so the handles start above your ears; they should start near shoulder height.',
    'Shrugging into the press; keep your shoulders down as you drive up.',
  ],
  single_arm_machine_shoulder_press: [
    'Twisting off the pad toward the working arm; stay square.',
    'Letting the stack slam between reps; stop just short.',
  ],
  smith_machine_shoulder_press: [
    'Sitting where the fixed path forces the bar into your face; line it up just in front of your nose.',
    'Relying on the rails for balance and rushing the negative.',
  ],
  cable_shoulder_press: [
    'Letting the cables pull your arms backward at the bottom; control the stretch.',
    'Pressing while leaning back; stagger your stance and keep your ribs down.',
  ],
  single_arm_cable_shoulder_press: [
    'Letting the cable twist your torso; brace against the pull.',
    'Losing the path; keep the handle stacked over your elbow.',
  ],
  resistance_band_overhead_press: [
    'Standing on the band unevenly so one side is heavier; center your feet.',
    'Letting the band yank your arms down; resist the descent.',
  ],
  z_press: [
    'Rounding your back to sit flat; if you cannot sit tall with legs out, elevate your hips slightly.',
    'Leaning back to press; the floor seat takes away your cheat, honor it.',
  ],
  viking_press: [
    'Pressing with your back arched; stack ribs over hips before the drive.',
    'Half lockouts; finish each press with arms straight.',
  ],
  landmine_press: [
    'Standing too upright; lean slightly into the bar so you press along its arc.',
    'Letting your shoulder shrug into your ear at the top.',
  ],
  single_arm_landmine_press: [
    'Rotating your torso open as you press; stay square to the bar.',
    'Starting the bar too low on your chest; rack it at your shoulder.',
  ],
  pike_push_up: [
    'Bending at the knees instead of holding the pike; keep your hips high.',
    'Lowering your chest instead of the top of your head; aim your crown at the floor.',
    'Flaring the elbows straight out; keep them tracking at about 45 degrees.',
  ],
  incline_pike_push_up: [
    'Losing the pike and turning it into an incline push-up; keep your hips over your shoulders.',
    'Dropping your head between your arms; keep your neck neutral.',
  ],
  handstand_push_up: [
    'Kicking up before your wall handstand hold is solid.',
    'Banana back against the wall; stack ribs over hips and squeeze your glutes.',
    'Diving the head down off-line; lower to a tripod position with control.',
  ],
  // Lateral raises
  dumbbell_lateral_raise: [
    'Swinging the weights up with momentum; raise them under control.',
    'Shrugging as you lift; lead with your elbows, not your traps.',
    'Raising far above shoulder height; stop around parallel.',
  ],
  seated_dumbbell_lateral_raise: [
    'Rocking your torso to start the rep; the seat is there to stop that.',
    'Shrugging into your ears; keep your shoulders down.',
  ],
  single_arm_dumbbell_lateral_raise: [
    'Leaning into the working side to hoist the weight; stay tall.',
    'Rushing the lowering; the negative is half the exercise.',
  ],
  lean_away_dumbbell_lateral_raise: [
    'Losing the lean mid set; keep your holding arm straight and your body angle fixed.',
    'Swinging from the bottom; the lean loads the start, control it.',
  ],
  cable_lateral_raise: [
    'Standing too close to the stack so there is no tension at your side; step away slightly.',
    'Shrugging as the handle rises; lead with your elbow.',
  ],
  single_arm_cable_lateral_raise: [
    'Leaning away from the stack more and more each rep; set your posture and hold it.',
    'Letting the cable drop fast; control the return.',
  ],
  behind_the_back_cable_lateral_raise: [
    'Letting the handle swing in front of your body; keep the path behind and to the side.',
    'Cranking the top of the rep with a shrug.',
  ],
  lean_away_cable_lateral_raise: [
    'Losing the fixed lean; anchor your grip and keep the angle constant.',
    'Turning it into a swing; the extra range only counts under control.',
  ],
  machine_lateral_raise: [
    'Seat height off so the pads push at your wrists or elbows unevenly; adjust until your arms line up with the pivot.',
    'Slamming the stack down between reps.',
  ],
  single_arm_machine_lateral_raise: [
    'Leaning into the machine to grind out reps; stay upright.',
    'Rushing the negative; lower slowly against the pad.',
  ],
  resistance_band_lateral_raise: [
    'Standing on too much band and turning the top into a fight; pick tension you can control to shoulder height.',
    'Shrugging as the band gets heavy near the top.',
  ],
  // Front raises + scaption + Y
  dumbbell_front_raise: [
    'Swinging the weights up with your hips; raise strictly.',
    'Lifting far above shoulder height with a shrug; stop around parallel.',
  ],
  single_arm_cable_front_raise: [
    'Rocking backward to help the cable up; brace and stay still.',
    'Letting the cable snap your arm down; control the return.',
  ],
  plate_front_raise: [
    'Leaning back to counterweight the plate; keep your ribs stacked.',
    'Gripping only with your fingertips; squeeze the plate flat between your palms.',
  ],
  dumbbell_scaption: [
    'Raising straight out to the side; keep your arms about 30 degrees forward of that.',
    'Turning thumbs down; keep thumbs up to give the shoulder room.',
  ],
  dumbbell_y_raise: [
    'Shrugging as your arms rise; reach long into the Y instead.',
    'Going heavy; this is a light, precise movement.',
  ],
  // Upright rows
  barbell_upright_row: [
    'Pulling the bar to your chin with a narrow grip; elbows above wrists to chest height is enough.',
    'Letting your wrists lead the pull; drive with your elbows.',
    'Jerking the bar off your hips with body english.',
  ],
  dumbbell_upright_row: [
    'Pulling the weights up your body past chest height; stop when your elbows reach shoulder level.',
    'Curling your wrists at the top; keep them loose and let the elbows lead.',
  ],
  ez_bar_upright_row: [
    'Gripping too narrow even with the angled bar; keep your hands around shoulder width.',
    'Yanking the bar up; pull smoothly with your elbows.',
  ],
  cable_upright_row: [
    'Standing too far from the pulley so the cable drags you forward; stand over it.',
    'Rolling your shoulders forward at the top; pull straight up.',
  ],
  rope_upright_row: [
    'Keeping the rope ends pinned together; let them split apart as you pull.',
    'Pulling to your chin; elbows to shoulder height is the finish.',
  ],
  // Rear delts
  face_pull: [
    'Pulling to your chest; aim the rope at the bridge of your nose.',
    'Letting your elbows drop; finish with knuckles beside your ears.',
    'Stacking on weight and leaning back; this move rewards light and strict.',
  ],
  resistance_band_face_pull: [
    'Anchoring the band too low; set it at face height or above.',
    'Pulling with your arms only; squeeze your shoulder blades as the band splits.',
  ],
  reverse_pec_deck: [
    'Setting the handles so you press backward with bent arms; keep a fixed soft bend and sweep wide.',
    'Throwing the pads back and letting them fly home; control both directions.',
  ],
  cable_reverse_fly: [
    'Turning the fly into a row; keep your arms long as they sweep.',
    'Standing upright out of the crossover line; set your stance so the cables cross at your chest.',
  ],
  single_arm_cable_reverse_fly: [
    'Rotating your torso open with the pull; stay square and let the arm sweep alone.',
    'Chasing weight; the rear delt gives out long before your rowing muscles.',
  ],
  bent_over_dumbbell_reverse_fly: [
    'Standing up as the set gets hard; hold the hinge at near-parallel.',
    'Swinging the weights with a bounce; sweep them wide under control.',
    'Squeezing your shoulder blades hard together and turning it into a row.',
  ],
  seated_bent_over_dumbbell_reverse_fly: [
    'Lifting your chest off your thighs to help the raise; stay folded.',
    'Banging the weights together under your legs between reps.',
  ],
  incline_bench_rear_delt_fly: [
    'Pushing off the bench with your chest to heave the weights; the pad is there to keep you honest.',
    'Bending the elbows more as you tire; the arc stays fixed.',
  ],
  chest_supported_cable_rear_delt_fly: [
    'Letting the cables pull you forward off the pad; set your chest and stay planted.',
    'Rowing with bent arms instead of sweeping wide.',
  ],
  resistance_band_reverse_fly: [
    'Gripping the band so wide there is no tension at the start; shorten your grip.',
    'Letting the band snap your arms together; control the return.',
  ],
  rear_delt_row: [
    'Pulling with elbows tucked, which turns it into a lat row; keep your elbows high and wide.',
    'Standing up out of the hinge as you fatigue.',
  ],
  chest_supported_rear_delt_row: [
    'Rowing to your hips; pull high toward your chest with wide elbows.',
    'Bouncing your chest off the pad for momentum.',
  ],
  high_cable_rear_delt_row: [
    'Letting the cable pull your shoulders forward between reps; stay braced.',
    'Dropping the elbows into a lat pull; keep them up in line with your shoulders.',
  ],
  prone_t_raise: [
    'Lifting your chest off the floor or bench to raise higher; only the arms move.',
    'Shrugging as you lift; reach long through your fingertips first.',
  ],
  band_pull_apart: [
    'Bending your elbows into a row; keep your arms long.',
    'Letting the band snap back; return as slowly as you pulled.',
    'Shrugging as it stretches; keep your shoulders down.',
  ],
  low_cable_pull_apart: [
    'Turning it into a rear-delt fly with a hinge; stay tall and pull apart at chest height.',
    'Overstretching at the start so the cables yank you; step back for constant tension.',
  ],
  // Rotator cuff essentials
  band_standing_external_rotation: [
    'Drifting your elbow away from your side; pin it to your ribs, a towel under the arm helps.',
    'Rotating fast; slow and controlled is the whole point.',
  ],
  cable_standing_external_rotation: [
    'Standing so the cable pulls at an angle; set the pulley at elbow height.',
    'Twisting your torso instead of rotating the shoulder.',
  ],
  side_lying_dumbbell_external_rotation: [
    'Using a weight heavy enough to swing; the cuff wants light and slow.',
    'Letting the elbow slide off your side; keep it pinned.',
  ],
  band_standing_internal_rotation: [
    'Elbow drifting away from your ribs as you rotate in; keep it pinned.',
    'Rushing the return; resist the band both ways.',
  ],
  cable_standing_internal_rotation: [
    'Leaning into the stack to help the rotation; stay tall and let the shoulder do it.',
    'Pulley set too high or low; line it up with your elbow.',
  ],
  single_arm_serratus_wall_slide: [
    'Shrugging as your arm slides up; reach up and forward instead.',
    'Losing contact with the wall; keep gentle pressure the whole slide.',
  ],
  single_arm_full_can_raise: [
    'Turning the thumb down, which is the impingement position; keep the thumb up as if holding a full can.',
    'Raising past shoulder height with a shrug.',
  ],

  // ─── arms (88) ────────────────────────────────────────────────────────
  // Biceps: standing curls
  standing_barbell_curl: [
    'Swinging the bar up with your hips; if you have to lean back, the bar is too heavy.',
    'Elbows drifting forward and up, which turns it into a front raise; keep them pinned at your sides.',
    'Dropping the bar down fast; the lowering builds as much as the lift.',
  ],
  standing_dumbbell_curl: [
    'Rocking your torso to start each rep; stand tall and curl strictly.',
    'Half-lowering between reps; take the weights all the way down.',
    'Elbows creeping forward; keep them at your ribs.',
  ],
  standing_ez_bar_curl: [
    'Swinging with your lower back; brace and let only your forearms move.',
    'Cutting the bottom of the range; full extension, then curl.',
  ],
  standing_alternating_dumbbell_curl: [
    'Swinging the resting arm side to side for rhythm; keep both sides quiet.',
    'Racing the alternation; finish each curl fully before starting the other.',
  ],
  single_arm_standing_dumbbell_curl: [
    'Leaning away from the working arm; stay tall.',
    'Turning the elbow into a hinge point that drifts; pin it to your side.',
  ],
  standing_band_curl: [
    'Stepping on the band unevenly so tension differs side to side; center your feet.',
    'Letting the band snap your arms down; resist the whole descent.',
  ],
  standing_straight_bar_cable_curl: [
    'Standing so close the cable goes slack at the bottom; step back for constant tension.',
    'Leaning back as the set gets heavy; keep your ribs stacked.',
  ],
  standing_ez_bar_cable_curl: [
    'Letting the cable pull your elbows forward; keep them pinned as you curl.',
    'Rushing the lowering to chase reps; the cable rewards a slow negative.',
  ],
  single_arm_standing_cable_curl: [
    'Rotating your torso toward the stack; stay square and let the arm work alone.',
    'Curling across your body; keep the path straight up.',
  ],
  bayesian_cable_curl: [
    'Standing too close to the pulley, which kills the behind-the-body stretch; step forward until your arm is drawn slightly back.',
    'Letting the elbow travel forward as you curl; the stretch position is the point.',
  ],
  dual_high_cable_curl: [
    'Letting your elbows drop as you fatigue; keep upper arms level with your shoulders.',
    'Pulling your fists behind your head; curl toward your ears and stop.',
  ],
  standing_barbell_drag_curl: [
    'Letting the bar swing away from your body; drag it up your torso with elbows traveling back.',
    'Chasing height; the bar stops lower than a normal curl.',
  ],
  wall_strict_barbell_curl: [
    'Letting your upper back or hips leave the wall; every point of contact stays.',
    'Bouncing out of the bottom; pause, then curl.',
  ],
  // Biceps: supported curls
  incline_dumbbell_curl: [
    'Setting the bench too upright, which loses the stretch; keep it around 45 to 60 degrees.',
    'Letting your elbows drift forward off the line of your torso; let them hang straight down.',
    'Shortening the bottom; let your arms hang fully before each curl.',
  ],
  preacher_ez_bar_curl: [
    'Lifting your armpits off the pad to heave the weight; stay glued to it.',
    'Slamming into full extension at the bottom; control the last few degrees.',
  ],
  preacher_barbell_curl: [
    'Bouncing out of the stretched bottom; the preacher pad gives your elbows no help there.',
    'Scooting your elbows down the pad mid set; reset them high and centered.',
  ],
  preacher_dumbbell_curl: [
    'Letting the wrist break backward at the bottom; keep it neutral.',
    'Half reps at the top of the pad; curl until your forearm is vertical.',
  ],
  machine_preacher_curl: [
    'Seat set so your elbows sit below the pivot; line them up with the machine cam.',
    'Letting the stack yank your arms into extension; resist the negative.',
  ],
  seated_biceps_curl_machine: [
    'Gripping the handles before setting your elbows; anchor your upper arms on the pad first.',
    'Leaning back for the last reps; keep your chest against the support.',
  ],
  iso_lateral_biceps_curl_machine: [
    'Letting the stronger arm finish first every rep; move both sides together.',
    'Shrugging as the handles rise.',
  ],
  chest_supported_dumbbell_curl: [
    'Pushing your chest off the pad to cheat; the support exists to stop that.',
    'Swinging the dumbbells forward at the bottom; hang, then curl.',
  ],
  spider_dumbbell_curl: [
    'Letting your arms drift back under the bench; keep them hanging straight down.',
    'Cutting the top short; squeeze at full flexion since this angle loads it hardest.',
  ],
  spider_ez_bar_curl: [
    'Sliding down the bench until your chest loses support; set up high on the pad.',
    'Swinging the bar toward the bench legs; curl straight up.',
  ],
  seated_dumbbell_curl: [
    'Rocking your torso off the bench back; sit tall and curl strictly.',
    'Resting the weights on your thighs between reps; keep tension through the set.',
  ],
  seated_concentration_curl: [
    'Pushing the elbow into your thigh and prying the weight up; the thigh is a shelf, not a lever.',
    'Rotating your wrist mid curl; keep your palm up throughout.',
  ],
  // Hammer / reverse / forearm curls
  dumbbell_hammer_curl: [
    'Swinging the weights with your shoulders; pin your elbows and curl.',
    'Letting the thumbs tilt inward at the top; keep the neutral grip honest.',
  ],
  alternating_dumbbell_hammer_curl: [
    'Using the alternation as a rest to swing each side; stay strict both arms.',
    'Racing the tempo; finish each rep before the next begins.',
  ],
  cross_body_hammer_curl: [
    'Curling to your shoulder instead of across to the opposite pec; the cross-body path is the exercise.',
    'Twisting your torso toward the working arm.',
  ],
  rope_cable_hammer_curl: [
    'Letting the rope ends collapse together; keep pulling them slightly apart.',
    'Leaning back to finish the top of the curl.',
  ],
  zottman_curl: [
    'Rotating at the bottom instead of the top; curl palms up, turn palms down, then lower.',
    'Dropping the lowering phase; the palms-down descent is the whole point.',
  ],
  barbell_reverse_curl: [
    'Letting your wrists break backward under the bar; keep knuckles up and wrists straight.',
    'Swinging with the hips like a heavy curl; go lighter and stricter than your normal curl.',
  ],
  ez_bar_reverse_curl: [
    'Gripping wide of the angled sections; hands on the downward slopes, knuckles up.',
    'Elbows drifting forward at the top; keep them pinned.',
  ],
  dumbbell_reverse_curl: [
    'Letting the dumbbells tilt thumb-up mid rep, which turns it into a hammer curl; keep palms down.',
    'Curling higher by shrugging; stop where your forearms are vertical.',
  ],
  seated_barbell_wrist_curl: [
    'Lifting your forearms off your thighs; only your wrists move.',
    'Cutting the stretch; let the bar roll to your fingertips at the bottom.',
  ],
  seated_dumbbell_wrist_curl: [
    'Bouncing the weight at the bottom of the stretch; roll it down slowly to your fingers.',
    'Forearms sliding off your thighs mid set; reset so wrists hang just past your knees.',
  ],
  seated_barbell_wrist_extension: [
    'Gripping too tight, which limits the range; hold the bar loose enough to hinge fully.',
    'Lifting your elbows to raise the bar higher; only the wrists extend.',
  ],
  seated_dumbbell_wrist_extension: [
    'Using the same weight as wrist curls; extension is much weaker, go lighter.',
    'Forearms lifting off your thighs; keep them planted.',
  ],
  behind_the_back_barbell_wrist_curl: [
    'Letting the bar drift away from your body; keep it brushing the back of your thighs.',
    'Bending your elbows to help; arms stay long.',
  ],
  wrist_roller_palms_up: [
    'Dropping your arms as you roll; keep them near shoulder height throughout.',
    'Spinning the roller with loose half turns; grip and turn deliberately, all the way up and all the way down.',
  ],
  // Triceps: pushdowns + kickbacks
  rope_cable_pushdown: [
    'Elbows flaring and drifting forward as you push; pin them to your sides.',
    'Leaning your whole torso over the cable to shove it down; stay tall.',
    'Skipping the spread at the bottom; pull the rope ends apart as you lock out.',
  ],
  straight_bar_cable_pushdown: [
    'Letting the bar ride up fast and drag your shoulders forward; control the return.',
    'Elbows winging out; keep them tucked and still.',
  ],
  ez_bar_cable_pushdown: [
    'Leaning onto the bar with bodyweight; if you need to lean, drop the stack a pin.',
    'Wrists collapsing at lockout; keep them straight.',
  ],
  single_arm_cable_pushdown: [
    'Rotating your shoulder into the press; only the elbow opens and closes.',
    'Standing square to the stack so the cable rubs your body; angle slightly away.',
  ],
  band_pushdown: [
    'Anchoring the band so low there is no tension up top; anchor overhead height.',
    'Letting the band throw your hands up; resist the return.',
  ],
  dumbbell_kickback: [
    'Dropping your upper arm as you extend; keep it locked parallel to the floor.',
    'Swinging the weight back with momentum; pause at full extension.',
  ],
  cable_kickback: [
    'Standing too upright; hinge until your torso is near parallel.',
    'Letting the cable pull your elbow down between reps; the upper arm stays frozen.',
  ],
  // Triceps: lying + overhead extensions
  lying_ez_bar_triceps_extension: [
    'Flaring the elbows wide as the bar lowers; keep them pointing at the ceiling.',
    'Lowering to your face; aim just past the top of your head.',
    'Letting the upper arms rock back and forth; they stay still, only elbows bend.',
  ],
  lying_dumbbell_triceps_extension: [
    'Letting the dumbbells drift toward your face; lower them beside your ears.',
    'Elbows sliding apart on the way down; keep them shoulder width.',
  ],
  lying_barbell_triceps_extension: [
    'Bouncing the bar off your forehead line; lower slowly to just behind your head.',
    'Turning it into a pullover by moving your shoulders; only the elbows hinge.',
  ],
  rolling_dumbbell_triceps_extension: [
    'Skipping the roll-back; let the weights drift behind your head before pressing.',
    'Rushing; the roll works because it is smooth, not fast.',
  ],
  floor_dumbbell_triceps_extension: [
    'Bouncing your upper arms off the floor at the bottom; touch softly and press.',
    'Letting the weights wander over your face; keep them tracking beside your head.',
  ],
  standing_dumbbell_overhead_triceps_extension: [
    'Flaring your elbows wide; keep them close beside your ears.',
    'Arching your lower back as the weight drops behind you; brace your ribs down.',
    'Cutting the stretch short; lower until your forearms touch your biceps.',
  ],
  seated_dumbbell_overhead_triceps_extension: [
    'Sliding your hips forward to arch under the weight; sit tall against the pad.',
    'Elbows drifting apart behind your head; keep them narrow.',
  ],
  standing_barbell_overhead_triceps_extension: [
    'Gripping too wide; hands about shoulder width keeps the elbows honest.',
    'Letting your ribs flare as the bar lowers; brace before every rep.',
  ],
  seated_barbell_overhead_triceps_extension: [
    'Arching off the backrest to press; keep contact and let the triceps work.',
    'Half lockouts overhead; finish with arms straight.',
  ],
  standing_ez_bar_overhead_triceps_extension: [
    'Elbows flaring as the bar drops behind your head; squeeze them inward.',
    'Rushing out of the deep stretch; pause, then extend.',
  ],
  standing_rope_cable_overhead_extension: [
    'Standing too upright with slack cable; hinge slightly forward and step away from the stack.',
    'Skipping the rope split at lockout; pull the ends apart as your arms straighten.',
  ],
  seated_rope_cable_overhead_extension: [
    'Setting up so the cable pulls you off the bench; anchor your feet and brace.',
    'Elbows drifting wide; keep them beside your head.',
  ],
  single_arm_cable_overhead_extension: [
    'Letting the cable rotate your torso; brace against the pull.',
    'Dropping the elbow as you extend; it stays pointed at the ceiling.',
  ],
  standing_band_overhead_extension: [
    'Anchoring the band so it pulls sideways; stand so the pull is straight down your back.',
    'Letting the band fold you backward; brace your core.',
  ],
  seated_triceps_extension_machine: [
    'Seat set so the pivot sits at your wrists; line the machine hinge up with your elbows.',
    'Letting the stack slam on the return.',
  ],
  bodyweight_triceps_extension_on_bar: [
    'Letting your hips break the plank line; keep your body one straight lever.',
    'Flaring elbows sideways; they point down the bar.',
  ],
  dumbbell_pjr_pullover_extension: [
    'Turning it into a pure pullover; the elbows bend and extend, not just the shoulders.',
    'Losing the elbow tuck at the stretch; keep them tracking narrow.',
  ],
  tate_press: [
    'Letting the dumbbells drift toward your face on the descent; the plates land on your chest, elbows out.',
    'Pressing the weights apart at the top; finish with them together over your chest.',
  ],
  jm_press: [
    'Treating it like a close-grip bench; the bar lowers toward your chin, elbows tucked and forward.',
    'Going heavy before the groove is second nature; this lift punishes guessing.',
  ],
  // Triceps: presses + dips
  close_grip_bench_press: [
    'Gripping so narrow your wrists cave inward; hands just inside shoulder width is enough.',
    'Flaring your elbows off your ribs; keep them tucked.',
    'Bouncing the bar off your chest.',
  ],
  close_grip_barbell_floor_press: [
    'Bouncing your triceps off the floor; pause softly at the bottom.',
    'Letting the bar drift toward your face; touch low on the chest.',
  ],
  smith_machine_close_grip_bench_press: [
    'Lying where the fixed path forces your wrists to bend; line the bar over your lower chest.',
    'Letting the rails do the balance and rushing the lowering.',
  ],
  close_grip_push_up: [
    'Hands so narrow your wrists hurt; just inside shoulder width works.',
    'Elbows flaring out; keep them brushing your ribs.',
  ],
  diamond_push_up: [
    'Hips sagging as fatigue sets in; hold the plank line.',
    'Placing the diamond up near your face; keep your hands under your chest.',
  ],
  weighted_close_grip_push_up: [
    'Plate resting on your neck; center it over your mid back.',
    'Losing the elbow tuck under the extra load.',
  ],
  parallel_bar_dip: [
    'Shrugging your shoulders up at the bottom; press them down away from your ears.',
    'Half reps; lower until your upper arms are about parallel.',
    'Flaring elbows wide; keep them tracking back.',
  ],
  weighted_parallel_bar_dip: [
    'Adding weight before your bodyweight dips are crisp.',
    'Letting the belt swing you; slow the descent until the chain hangs quiet.',
  ],
  ring_dip: [
    'Letting the rings drift away from your body; keep them pinned to your sides.',
    'Rushing reps; stabilizing the turnout at the top is part of the work.',
  ],
  assisted_parallel_bar_dip: [
    'Letting the band throw you out of the bottom; control the stretch anyway.',
    'Keeping the same assistance forever; drop band tension as you get stronger.',
  ],
  assisted_dip_machine: [
    'Kneeling on the pad with all your weight and just riding it; use only as much help as you need.',
    'Short pumps at the top; take the full dip range.',
  ],
  seated_dip_machine: [
    'Shrugging as you press down; lock your shoulders down first.',
    'Letting the handles fly up between reps; control the return.',
  ],
  bench_dip: [
    'Dipping deep with your hands behind you; stop where your shoulders feel stacked, this position is unforgiving.',
    'Scooting your hips far from the bench; keep them brushing it.',
  ],
  // Grip
  dead_hang: [
    'Hanging with shrugged, slack shoulders; pull them gently down and back.',
    'Death-gripping with fingertips only; wrap the bar deep in your palm.',
  ],
  towel_dead_hang: [
    'Towels of different thickness or grip width; match them so both hands work evenly.',
    'Dropping off at failure from height; step down while you still have grip.',
  ],
  towel_pull_up: [
    'Jumping into towel pull-ups before towel hangs are solid; grip goes before back here.',
    'Uneven grips creeping in; set both fists at the same height.',
  ],
  dumbbell_static_hold: [
    'Letting the weights rest against your thighs; hold them just clear at your sides.',
    'Shrugging up to hold on; stand tall with shoulders set.',
  ],
  barbell_static_hold: [
    'Snatching the bar off the rack; set your grip, then stand tall with it.',
    'Letting your lower back round as grip fades; put the bar down before posture goes.',
  ],
  farmer_handle_carry: [
    'Leaning forward into a shuffle; walk tall with short quick steps.',
    'Letting the handles tilt front-down; level them like a suitcase.',
  ],
  trap_bar_carry: [
    'Standing up unevenly and letting the bar seesaw; center your grip before you walk.',
    'Long strides that swing the load; keep steps short.',
  ],
  plate_pinch_hold: [
    'Letting the plates slide to your fingertips; keep them deep against your palm pads.',
    'Bending your wrist to cradle the plates; pinch with a straight wrist.',
  ],
  plate_pinch_carry: [
    'Walking fast enough to swing the plates; smooth short steps.',
    'Dropping plates from height when grip fails; set them down or walk over turf.',
  ],
  hand_gripper_close: [
    'Half closes count for little; set the gripper so you can fully touch the handles.',
    'Recruiting your whole arm and shoulder; the squeeze lives in your hand.',
  ],

  // ─── core (80) ────────────────────────────────────────────────────────
  // Planks + anti-extension
  front_plank: [
    'Hips sagging toward the floor; squeeze your glutes and tuck your ribs.',
    'Hips piked up to make it easier; hold one straight line from head to heels.',
    'Holding your breath; breathe steadily behind the brace.',
  ],
  rkc_plank: [
    'Treating it like a normal plank; drive elbows toward toes and squeeze everything at maximum.',
    'Chasing minutes; ten hard seconds beats a soft sixty.',
  ],
  long_lever_plank: [
    'Elbows only an inch forward; set them under your eyes, not your shoulders.',
    'Letting the hips sag as the lever lengthens; brace harder than a normal plank.',
  ],
  weighted_plank: [
    'Plate placed on your neck or low back; center it over your mid back.',
    'Letting your hips drop under the load; if the line breaks, go lighter.',
  ],
  plank_shoulder_tap: [
    'Hips rocking side to side with each tap; widen your feet and slow down.',
    'Rushing the taps; a quiet body is the exercise.',
  ],
  plank_up_down: [
    'Hips swiveling as you climb; brace and keep your belt line level.',
    'Always leading with the same arm; alternate which arm climbs first.',
  ],
  side_plank: [
    'Hips dropping toward the floor; push them up in line with your body.',
    'Rolling your chest toward the ground; stack your shoulders and hips.',
    'Supporting elbow drifting from under your shoulder.',
  ],
  side_plank_hip_dip: [
    'Dropping the hip fast and bouncing off the bottom; lower with control.',
    'Rolling forward as you dip; the hips travel straight down and up.',
  ],
  bear_plank: [
    'Knees hovering high; keep them an inch off the floor.',
    'Rounding or arching your back; keep it table flat.',
  ],
  bear_crawl: [
    'Hips swaying and knees flaring wide; crawl with knees under hips, an inch off the floor.',
    'Big lunging steps; move hand and opposite foot a few inches at a time.',
  ],
  quadruped_hover: [
    'Shrugging into your shoulders as you hover; press the floor away.',
    'Letting the back round when the knees lift; keep it flat.',
  ],
  slider_body_saw: [
    'Sliding further than your brace can hold; lengthen the saw gradually.',
    'Piking the hips to make the return easier.',
  ],
  ab_wheel_rollout: [
    'Leading with your hips so your lower back arches; tuck your ribs and roll out only as far as you stay flat.',
    'Bending your arms to pull back in; drag with your abs and lats.',
    'Kneeling on a hard floor; pad your knees so pain does not cut the set short.',
  ],
  barbell_rollout: [
    'Letting your lower back sag mid rollout; shorten the range until your brace holds.',
    'Uneven plates that steer the bar; load both sides the same.',
  ],
  stability_ball_rollout: [
    'Sinking your chest into the ball at full stretch; keep tension through your trunk.',
    'Rolling out on your fists; forearms on the ball.',
  ],
  slider_rollout: [
    'Reaching the arms without moving the hips; the whole body slides forward as one line.',
    'Collapsing at the shoulders in the stretch; press the floor away.',
  ],
  walkout_to_plank: [
    'Bending your knees on the walk out; keep legs long and let your hamstrings stretch.',
    'Racing your hands out and back; slow steps keep tension on.',
  ],
  // Motor control
  dead_bug: [
    'Lower back popping off the floor as the leg lowers; press it flat before each rep.',
    'Moving arm and leg on the same side; it is opposite arm, opposite leg.',
    'Holding your breath; exhale as the limbs lower.',
  ],
  wall_press_dead_bug: [
    'Pressing the wall softly; push hard enough to feel your abs switch on.',
    'Letting the ribs flare as the leg reaches; keep them stacked.',
  ],
  bird_dog: [
    'Lifting the leg so high your back arches; reach long, not up.',
    'Tipping sideways as the limbs float; keep your belt line level.',
    'Rushing reps; pause with fingertips and heel reaching apart.',
  ],
  // Hollow family
  hollow_body_hold: [
    'Lower back arching off the floor; tuck harder or raise your legs until it presses flat.',
    'Chin jammed to chest; keep your gaze past your knees.',
  ],
  tuck_hollow_hold: [
    'Shoulders resting on the floor; curl them up and hold.',
    'Losing the flat lower back even in the tuck; that contact is the whole drill.',
  ],
  hollow_body_rock: [
    'Breaking the banana shape to create the rock; the shape stays rigid and momentum does the rocking.',
    'Rocking so big you slap the floor; small and smooth.',
  ],
  hollow_flutter_kick: [
    'Kicking from the knees; the legs stay long and the flutter is small.',
    'Lower back peeling off the floor as the legs drop; keep the kicks higher.',
  ],
  // Anti-rotation
  standing_pallof_press: [
    'Letting the cable rotate you as your arms extend; press dead straight out.',
    'Standing tall and narrow; soften your knees and set a shoulder-width stance.',
    'Rushing; hold each press out for a beat before returning.',
  ],
  standing_pallof_hold: [
    'Drifting toward the stack as you fatigue; pick a spot and stay planted.',
    'Shrugging into the hold; arms long, shoulders down.',
  ],
  split_stance_pallof_press: [
    'Wobbling on a tightrope stance; split front-to-back with hip-width tracks.',
    'Letting the back hip open toward the cable; both hips face forward.',
  ],
  standing_single_arm_cable_press: [
    'Letting the cable twist your shoulders open; press as if both hands were working.',
    'Leaning away from the stack for leverage; stay tall.',
  ],
  // Carries + KB flow
  farmer_carry: [
    'Leaning forward into a shuffle; walk tall with short quick steps.',
    'Letting the shoulders slump into the weights; set them down and back before you walk.',
    'Gripping unevenly matched weights; balance the load unless offset is the goal.',
  ],
  suitcase_carry: [
    'Leaning away from the weight; the fight to stay dead level is the exercise.',
    'Letting the free arm windmill; keep it quiet at your side.',
  ],
  suitcase_hold: [
    'Hitching the hip toward the load; stand tall as if carrying nothing.',
    'Holding your breath through the hold; breathe behind the brace.',
  ],
  front_rack_carry: [
    'Elbows dropping so the bells drag you forward; keep elbows up and ribs down.',
    'Arching your back under the rack; brace like a plank.',
  ],
  overhead_carry: [
    'Elbow bending as you walk; lock the arm and push tall into the weight.',
    'Ribs flaring as the arm drifts back; keep the weight stacked over your shoulder.',
  ],
  sandbag_bear_hug_carry: [
    'Hugging the bag low on your hips; hold it high on your chest.',
    'Leaning back to counterweight; stay tall and let your trunk fight.',
  ],
  turkish_get_up: [
    'Taking your eyes off the bell; watch it until you are standing.',
    'Skipping steps to hurry; every position earns the next one.',
    'Starting heavy; own the empty-hand get-up first.',
  ],
  half_turkish_get_up: [
    'Rolling straight up with a crunch; drive through your elbow, then your palm.',
    'Bell arm bending; it stays locked and vertical throughout.',
  ],
  kettlebell_windmill: [
    'Bending the front knee and turning it into a lunge; hinge your hips back and keep legs long.',
    'Losing sight of the bell; eyes on it the whole way down and up.',
  ],
  // Crunch family
  floor_crunch: [
    'Yanking your neck with your hands; fingertips behind ears, elbows wide.',
    'Sitting all the way up; a crunch lifts your shoulder blades, no more.',
    'Holding your breath; exhale as you curl up.',
  ],
  weighted_floor_crunch: [
    'Holding the plate at arms length to make it easier; keep it on your chest.',
    'Jerking the plate up with momentum; curl slow.',
  ],
  stability_ball_crunch: [
    'Sliding down the ball until it is a sit-up on a bouncy floor; keep your lower back on the ball.',
    'Feet dancing; plant them wide and still.',
  ],
  toe_touch_crunch: [
    'Swinging your arms to reach; curl your torso and let the reach follow.',
    'Dropping your legs toward you; the legs stay vertical and still.',
  ],
  kneeling_cable_crunch: [
    'Pulling with your arms; anchor your hands by your head and crunch your ribs to your hips.',
    'Hinging at the hips like a bow; the spine rounds, the hips stay still.',
    'Standing the stack up between reps; keep tension and stay in the crunch range.',
  ],
  ab_crunch_machine: [
    'Setting the pads at your collarbones; they should sit on your upper chest and shins comfortably.',
    'Driving the machine with your arms pulling the handles; the ribs do the folding.',
  ],
  oblique_crunch_machine: [
    'Twisting from your hips instead of your waist; the pelvis stays planted.',
    'Slamming the stack; control both directions.',
  ],
  sit_up: [
    'Anchoring your feet and yanking with your hip flexors; slow the rep and curl your spine up.',
    'Pulling your head forward with your hands.',
    'Flopping back down; lower with the same control you came up with.',
  ],
  weighted_sit_up: [
    'Holding the plate overhead before your bodyweight sit-ups are strict; chest hold first.',
    'Bouncing off the floor between reps.',
  ],
  decline_sit_up: [
    'Grabbing the bench behind your head for leverage; arms stay crossed or reaching.',
    'Setting a steep decline on day one; add angle gradually.',
  ],
  abmat_sit_up: [
    'Placing the mat under your hips; it goes under the arch of your lower back.',
    'Slamming your shoulders into the floor on the way down; the mat is not a crash pad.',
  ],
  bicycle_crunch: [
    'Pedaling fast with tiny twists; slow down and touch elbow to opposite knee each rep.',
    'Yanking your neck as you rotate; the elbow reaches, the hands stay light.',
  ],
  heel_touch: [
    'Lifting only your head to reach; curl the shoulder blade off the floor toward each heel.',
    'Rushing side to side; pause at each touch.',
  ],
  side_crunch: [
    'Rolling onto your back mid rep; stay on your side and crunch laterally.',
    'Pulling your head with the top hand.',
  ],
  // V-ups + tucks
  v_up: [
    'Bending your knees to meet your hands; legs stay long, meet in the middle.',
    'Slamming back to the floor; lower your shoulders and heels together with control.',
  ],
  tuck_up: [
    'Rocking off your tailbone with momentum; balance, tuck, and extend with control.',
    'Feet slapping down between reps; hover them just off the floor.',
  ],
  seated_knee_tuck: [
    'Gripping the bench and pulling with your arms; hands are for balance only.',
    'Letting your torso stay upright; lean back as the legs extend.',
  ],
  slider_knee_tuck: [
    'Hips piking as the knees come in; keep the plank line until the tuck itself.',
    'Sliding back out fast; resist the return.',
  ],
  // Reverse crunch + raises
  reverse_crunch: [
    'Swinging your legs for momentum; curl your hips off the floor with your abs.',
    'Only the legs moving; if your hips never lift, it is a leg raise, not a reverse crunch.',
  ],
  bench_reverse_crunch: [
    'Yanking on the bench so hard your shoulders shrug; grip lightly for anchor only.',
    'Dropping the legs past control on the way down.',
  ],
  lying_knee_raise: [
    'Arching your lower back as the knees lower; press it into the floor.',
    'Resting your feet between reps; hover them.',
  ],
  lying_leg_raise: [
    'Lower back peeling off the floor as the legs descend; stop the descent where it stays pressed down.',
    'Swinging the legs up with a bounce off the floor.',
    'Hands wedged under your hips forever; wean off them as you get stronger.',
  ],
  leg_lower: [
    'Both legs crashing down together past your brace; lower only as far as the back stays flat.',
    'Holding your breath on the way down; exhale through the lower.',
  ],
  bent_knee_leg_lower: [
    'Straightening the legs and turning it into the harder version; keep the 90 degree bend.',
    'Tapping the floor hard with your heels; touch silently.',
  ],
  hip_raise: [
    'Kicking your legs to throw the hips up; press them up with your abs, straight toward the ceiling.',
    'Rolling onto your neck; the lift comes from the hips, small and controlled.',
  ],
  flutter_kick: [
    'Kicks so big your back arches; small fast scissors just off the floor.',
    'Holding your breath; keep a steady rhythm.',
  ],
  // Hanging
  hanging_knee_raise: [
    'Swinging your body to launch the knees; kill the sway between reps.',
    'Stopping at 90 degrees; keep curling until knees reach chest height.',
  ],
  hanging_leg_raise: [
    'Kipping the legs up with a swing; dead hang, then raise.',
    'Arching your back at the bottom; keep a slight hollow between reps.',
    'Bending the knees as you tire; that turns it into a knee raise, rest instead.',
  ],
  weighted_hanging_knee_raise: [
    'Gripping the dumbbell loosely between your feet; squeeze it or it drops.',
    'Adding weight while your strict raises still swing.',
  ],
  toes_to_bar: [
    'Pure hip swing with no lat pressure; push the bar away as the toes rise.',
    'Legs flailing between reps; control the backswing or step down.',
  ],
  captains_chair_knee_raise: [
    'Shoulders shrugging up off the pads; press down into the armrests.',
    'Swinging the knees with momentum; pause at the bottom of every rep.',
  ],
  captains_chair_leg_raise: [
    'Leaning way back into the pad to lever the legs up; stay tall and lift with your abs.',
    'Bending the knees halfway up; keep the legs long or do knee raises.',
  ],
  // Rotation + side work
  russian_twist: [
    'Swinging your arms side to side while the chest stays square; rotate your whole torso.',
    'Rounding into a slump; lean back with a long spine.',
    'Feet anchored and heaving; elevate them only when your twist is strict.',
  ],
  weighted_russian_twist: [
    'Tapping the weight to the floor as the goal; rotate your chest, the touch is a bonus.',
    'Speeding up until it is all arms; the weight travels because your torso turns.',
  ],
  cable_torso_rotation: [
    'Arms bending and turning it into a row; arms stay long, torso does the turning.',
    'Hips spinning with the shoulders; keep them quiet so your waist does the work.',
  ],
  landmine_rotation: [
    'Bending your elbows to steer the bar; arms stay long in a wide arc.',
    'Feet planted flat while your knees twist; pivot the trailing foot like a golf swing.',
  ],
  standing_cable_wood_chop: [
    'Chopping with just your arms; turn your torso and let your arms carry the handle.',
    'Keeping both feet nailed flat; pivot the trailing foot as you rotate.',
  ],
  half_kneeling_cable_chop: [
    'Wobbling on a narrow base; set the down knee and front foot on separate tracks.',
    'Rocking your weight forward and back with the chop; the kneel stays still.',
  ],
  standing_band_wood_chop: [
    'Standing so close there is no band tension at the start; step out until it pulls.',
    'Letting the band snap you back up the diagonal; resist the return.',
  ],
  dumbbell_side_bend: [
    'Holding a weight in each hand, which cancels the exercise; load one side only.',
    'Leaning forward as you bend; travel straight down the side seam of your shorts.',
  ],
  medicine_ball_oblique_slam: [
    'Slamming straight down the middle; rotate and drive the ball outside your foot.',
    'Arms-only slams; wind up through your hips and trunk.',
  ],
  cross_body_mountain_climber: [
    'Hips riding up as you speed up; keep the plank flat while the knee crosses.',
    'Tapping the knee short of the opposite elbow; drive it all the way across.',
  ],
  rotary_torso_machine: [
    'Setting a big range and spinning freely; work a controlled arc your waist actually owns.',
    'Pushing with your arms on the pads; they only rest there.',
  ],

  // ─── back (82) ────────────────────────────────────────────────────────
  // Pull-ups + chin-ups
  pull_up_pronated: [
    'Kipping and half reps; dead hang at the bottom, chin clearly over the bar at the top.',
    'Shrugging up without pulling your shoulder blades down first; start every rep by setting your shoulders.',
    'Craning your chin over the bar; pull your chest toward it instead.',
  ],
  chin_up: [
    'Half reps that never reach a straight-arm hang; full stretch every time.',
    'Curling into it with arms only; drive your elbows down and back.',
  ],
  wide_grip_pull_up: [
    'Gripping so wide your range collapses; go just beyond shoulder width.',
    'Struggling the chin up with a shrug; if range dies, narrow the grip.',
  ],
  neutral_grip_pull_up: [
    'Letting the friendlier grip hide short reps; full hang to chin over hands.',
    'Elbows flaring forward at the top; keep pulling them down.',
  ],
  close_grip_chin_up_neutral: [
    'Turning the close grip into a biceps-only pull; drive the elbows down along your ribs.',
    'Bouncing out of the bottom hang.',
  ],
  weighted_pull_up: [
    'Adding load while your strict pull-ups still shake; earn crisp bodyweight sets first.',
    'Letting the belt swing you; pause the dead hang until the plate goes quiet.',
  ],
  chin_up_weighted_belt: [
    'Cutting the top short as the weight grows; chin clearly over, every rep.',
    'Dropping from the top rep into a swinging hang; lower under control.',
  ],
  band_assisted_pull_up: [
    'Letting the band fire you out of the bottom; control the stretch it wants to skip.',
    'Staying on the same band forever; step down tension as reps come.',
  ],
  machine_assisted_pull_up: [
    'Riding the pad with maximum help; use the least assistance that allows full reps.',
    'Leaning way back and rowing the handles; stay vertical and pull down.',
  ],
  jumping_pull_up: [
    'Jumping past the work; jump to the top, then lower as slowly as you can.',
    'Landing stiff between reps; bend your knees softly.',
  ],
  negative_pull_up: [
    'Dropping fast through the middle; fight for three to five seconds down.',
    'Skipping the top hold; start each negative with your chin over the bar.',
  ],
  hip_width_feet_elevated_chin_up: [
    'Pushing through your feet so hard your arms coast; use the lightest leg assist that lets you finish.',
    'Legs doing more each rep without noticing; keep the assist honest and shrink it over time.',
  ],
  active_hang_scapular_pull: [
    'Bending the elbows into a mini pull-up; arms stay straight, only the shoulder blades pull down.',
    'Tiny shrugs with no pause; hold the proud-chest bottom for a beat.',
  ],
  ring_pull_up: [
    'Fighting the rings from turning; let them rotate naturally as you pull.',
    'Swinging between reps; kill the sway before the next pull.',
  ],
  // Pulldowns
  lat_pulldown_wide: [
    'Leaning far back and rowing the bar down; a slight lean is fine, momentum is not.',
    'Pulling the bar to your belly; it meets the top of your chest.',
    'Half-stretching at the top; let your arms fully lengthen each rep.',
  ],
  lat_pulldown_neutral_grip: [
    'Elbows drifting behind you at the bottom; drive them straight down.',
    'Standing the stack up between reps; keep tension at the stretch.',
  ],
  close_grip_lat_pulldown: [
    'Rocking your torso for the last reps; lock your chest tall.',
    'Wrists curling at the bottom; pull with the elbows, hands are hooks.',
  ],
  lat_pulldown_supinated: [
    'Turning it into a big biceps curl; drive the elbows down and back.',
    'Bouncing at the stretch with straight arms and a supine grip; ease into the top.',
  ],
  lat_pulldown_rope: [
    'Pulling the rope to one collarbone; split the ends evenly to both sides.',
    'Losing the tall chest as the rope splits; stay proud through the pull.',
  ],
  wide_grip_lat_pulldown_front: [
    'Pulling behind your neck; to the top of the chest, always.',
    'Grip so wide the bar barely moves; just beyond shoulders.',
  ],
  single_arm_cable_pulldown: [
    'Rotating your torso to help the pull; stay square, elbow to your hip.',
    'Shrugging at the stretch; keep the shoulder blade set.',
  ],
  machine_lat_pulldown_selectorized: [
    'Thigh pads loose so your hips lift with the stack; lock them down first.',
    'Slamming the stack at the stretch.',
  ],
  seated_pulldown_machine_close: [
    'Sitting too far from the handles so the pull angles forward; sit where the cable runs vertical.',
    'Rocking for momentum; the seat and pads are there to keep you strict.',
  ],
  hammer_strength_pulldown: [
    'Pulling both handles unevenly; move them together or work one side deliberately.',
    'Shrugging as the handles rise; set your shoulders down before each pull.',
  ],
  bar_pulldown_seated_hammer: [
    'Wrist-curling the wide neutral handles; elbows drive down, hands hang on.',
    'Cutting the stretch to protect the stack from clanking; use a controlled full range.',
  ],
  banded_pulldown_standing: [
    'Anchoring the band so low the pull is a row; anchor high overhead.',
    'Letting the band jerk your arms up; resist the return.',
  ],
  jm_row_pulldown_hybrid: [
    'Standing square, which loses the lean-away stretch; angle your body so the lat starts lengthened.',
    'Yanking from the stretched position; ease out of the bottom.',
  ],
  straight_arm_cable_pulldown: [
    'Bending the elbows into a pushdown; arms stay long, the shoulder does the arc.',
    'Hunching over the cable at the bottom; hinge slightly and keep a proud chest.',
  ],
  single_arm_straight_arm_pulldown: [
    'Twisting toward the stack mid sweep; stay square.',
    'Whipping the handle down; the long-arm arc rewards a slow pull.',
  ],
  lat_prayer_cable: [
    'Praying with bent elbows; the arms stay long as they sweep down.',
    'Rounding your back to reach further; hinge and keep your spine long.',
  ],
  stir_the_pot_lat: [
    'Turning the pull-around into a row; keep the arm long as it sweeps across.',
    'Rotating your hips with the arm; the torso stays square while the lat drags the cable around.',
  ],
  // Pullovers
  dumbbell_pullover: [
    'Bending and straightening the elbows; lock a soft bend and move only at the shoulders.',
    'Dropping the weight far behind your head fast; lower to a strong stretch you control.',
    'Hips sagging off the bench; keep them level with your shoulders.',
  ],
  machine_pullover_nautilus: [
    'Setting the seat so your shoulders sit below the cam; line them up with the pivot.',
    'Riding the stack up fast; the long arc deserves a slow return.',
  ],
  // Barbell + heavy rows
  barbell_bent_over_row: [
    'Standing tall as the set gets heavy; hold your hinge near 45 degrees or lower.',
    'Yanking the bar with your lower back; if your torso heaves, drop weight.',
    'Pulling to your chest; the bar lands between belly button and lower ribs.',
  ],
  pendlay_row: [
    'Letting the bar drift off the floor between reps; every rep starts dead on the ground.',
    'Losing the flat parallel back; reset your hinge before each pull.',
  ],
  t_bar_row: [
    'Standing up with the weight as you fatigue; keep your torso angle fixed.',
    'Loading plates so large they block the range; smaller plates row deeper.',
  ],
  yates_row: [
    'Confusing the upright style for permission to heave; the 70 degree torso stays still.',
    'Pulling to your chest; the underhand bar rows to your belt line.',
  ],
  seal_row: [
    'Bouncing your chest off the bench for momentum; only your arms and shoulder blades move.',
    'Short-stroking; let the bar hang fully before each pull.',
  ],
  chest_supported_barbell_row: [
    'Pushing your chest off the pad on the pull; the support is the exercise contract.',
    'Shrugging at the top; finish by squeezing the shoulder blades, not lifting them.',
  ],
  chest_supported_dumbbell_row: [
    'Lifting your chest off the pad to heave the weights; stay glued to it.',
    'Rowing straight up to your armpits; drive the elbows back toward your hips.',
    'Dropping the dumbbells into a dead hang bounce; control the stretch.',
  ],
  meadows_row: [
    'Facing the wrong way down the bar; stand perpendicular with the sleeve at your feet.',
    'Letting your torso twist open with each pull; square your hips and stay hinged.',
  ],
  kroc_row: [
    'Turning controlled body english into flailing; momentum is allowed, losing the hinge is not.',
    'Skipping the stretch at the bottom to bounce reps; let the lat lengthen.',
  ],
  dumbbell_bent_over_row_bilateral: [
    'Standing up out of the hinge rep by rep; set your angle and hold it.',
    'Rowing the weights to your armpits with flared elbows; pull to your hips at about 45 degrees.',
  ],
  smith_machine_bent_over_row: [
    'Letting the fixed path drag you forward or back; set your feet where the bar meets your lower ribs.',
    'Standing tall to shorten the pull; hold the hinge.',
  ],
  trap_bar_row: [
    'Squatting the weight up instead of rowing; hinge, then pull the handles to your hips.',
    'Letting the bar tip forward; grip the handles at their centers.',
  ],
  resistance_band_bent_over_row: [
    'Standing on too little band; take up slack so the row starts with tension.',
    'Losing the hinge as the band fights back; brace like a barbell row.',
  ],
  // Single-arm + bodyweight rows
  single_arm_dumbbell_row: [
    'Twisting your torso open to hoist the weight; keep your shoulders square to the bench.',
    'Rowing with a shrug to your armpit; drive your elbow back toward your hip.',
    'Rounding over the bench; keep a long flat spine.',
  ],
  single_arm_kettlebell_row: [
    'Letting the bell swing under you; pause each rep so it hangs dead.',
    'Twisting to lift higher; square shoulders, elbow to hip.',
  ],
  gorilla_row: [
    'Standing too tall so the bells never leave the floor cleanly; hinge deep with a flat back.',
    'Rotating hard off the planted bell; keep your hips level as you alternate.',
  ],
  renegade_row: [
    'Hips swinging open with each row; widen your feet and freeze your plank.',
    'Rushing rows on soft wobbling dumbbells; use flat-sided bells on a stable floor.',
  ],
  overhand_bodyweight_row: [
    'Hips sagging into a banana; hold a plank as you pull your chest to the bar.',
    'Half pulls; touch your chest to the bar or raise it to make that possible.',
  ],
  inverted_row_supinated: [
    'Letting the hips drop as the biceps tire; body stays one line.',
    'Yanking your chin to the bar; lead with your chest.',
  ],
  feet_elevated_row_lat: [
    'Elevating your feet before flat rows are strict; earn the angle.',
    'Piking at the hips to make the pull shorter.',
  ],
  ring_row: [
    'Sagging hips; squeeze glutes and hold the plank line.',
    'Letting the rings wobble apart at the top; pull them to your lower chest together.',
  ],
  trx_row: [
    'Walking your feet forward past your strength; the steeper you lie, the harder it is.',
    'Shrugging at the top; finish with shoulder blades pinched, shoulders down.',
  ],
  table_lat_row: [
    'Using a table that slides or tips; test it with a hard pull first.',
    'Half range because the table is low; bend your knees and get your chest to the edge.',
  ],
  // Cable + machine rows
  seated_cable_row_close_neutral: [
    'Rocking your torso back and forth to move the stack; sit tall and row with your back.',
    'Rounding forward at the stretch and yanking; hinge slightly and pull smooth.',
    'Shrugging as the handle lands; drive elbows back, shoulders down.',
  ],
  seated_cable_row_wide_pronated: [
    'Pulling the wide bar to your belly like a close row; row higher, toward the lower chest, elbows wide.',
    'Leaning way back to finish; small controlled lean only.',
  ],
  seated_row_overhand: [
    'Elbows dropping to your sides, which turns it into a lat row; keep them at 45 degrees.',
    'Rocking for momentum; the torso holds still.',
  ],
  lat_focused_seated_row_narrow: [
    'Turning the underhand grip into a curl; elbows sweep back along your ribs.',
    'Slumping at the stretch; keep your chest tall as your arms lengthen.',
  ],
  seated_row_machine_wide: [
    'Chest pad set so you reach for the handles fully stretched; adjust so the plates just clear the stack.',
    'Pulling unevenly; both elbows travel together.',
  ],
  iso_row_machine_neutral: [
    'Shrugging into the neutral handles; set the shoulder blades down first.',
    'Slamming the weight home between reps; control the release.',
  ],
  machine_row_chest_pad: [
    'Pushing off the chest pad for extra pull; the pad keeps you honest, stay on it.',
    'Grabbing the handles with the seat too low or high; your hands should travel level with your elbows.',
  ],
  cable_row_rope_attachment: [
    'Letting the rope ends collapse together; pull them apart toward your ribs.',
    'Standing the stack up between reps; keep the stretch under tension.',
  ],
  seated_cable_row_single_arm: [
    'Rotating open with each pull; keep both shoulders facing the stack.',
    'Letting the cable drag your shoulder forward at the stretch; keep it set.',
  ],
  banded_row_seated: [
    'Band looped where it can slip off your feet mid row; anchor it around both arches and check it.',
    'Rounding your back at the stretch; hinge tall like a cable row.',
  ],
  machine_high_row: [
    'Pulling the handles to your shoulders with flared elbows; drive them down and back toward your ribs.',
    'Rising off the seat as the stack gets heavy.',
  ],
  // Traps + pulls
  barbell_shrug: [
    'Rolling your shoulders in circles; shrug straight up toward your ears and straight down.',
    'Bending your elbows to lift higher; arms stay long, traps do the lifting.',
    'Nodding your head forward under load; keep your neck tall.',
  ],
  dumbbell_shrug: [
    'Swinging the weights forward and back; shrug them straight up.',
    'Cutting the top; pause a beat at full height.',
  ],
  cable_shrug: [
    'Standing so far back the cable pulls you forward; stand over the pulley line.',
    'Rushing the lowering; the constant tension rewards a slow negative.',
  ],
  trap_bar_shrug: [
    'Letting the bar drift forward of your body; the neutral handles should ride your sides.',
    'Bouncing reps off knee bend; legs stay quiet.',
  ],
  seated_machine_shrug: [
    'Setting the seat so the handles start at your fingertips with locked arms; you want slack to shrug through.',
    'Leaning back to heave the stack; sit tall.',
  ],
  bent_over_trap_raise: [
    'Lifting with a shrug toward your ears; sweep the arms up and out in a Y.',
    'Standing up out of the hinge to raise higher; the angle is the exercise.',
  ],
  high_pull: [
    'Pulling with arms before the hips fire; jump first, then the elbows travel.',
    'Catching the bar high with wrists curled; the pull peaks at chest height, no catch.',
  ],
  power_clean: [
    'Curling the bar up with your arms; the hips launch it, arms guide it.',
    'Catching upright on straight legs with a soft chest; rack it on shoulders with elbows whipped through.',
    'Learning heavy; own the empty bar pattern first.',
  ],
  rack_pull: [
    'Setting the pins so low it becomes a bad deadlift; start at or just below the knees.',
    'Leaning back and yanking at lockout; stand up tall, squeeze, done.',
  ],
  snatch_grip_deadlift: [
    'Grabbing the wide grip with a rounded upper back; wedge in tight, chest proud.',
    'Treating it like your normal deadlift weight; the wide grip cuts your leverage, load lighter.',
  ],
  // Erectors + posture
  hyperextension_back_extension: [
    'Rocketing up past straight into a big arch; stop when your body forms one line.',
    'Dropping down loose; lower under control to a full stretch.',
    'Pad set at your thighs; the pad edge sits at your hip crease.',
  ],
  weighted_back_extension: [
    'Hugging the plate at your chin where it strains your neck; hold it to your chest.',
    'Adding weight while bodyweight reps still bounce; smooth first, heavy later.',
  ],
  machine_lumbar_extension: [
    'Pushing through your legs; anchor them and extend with your lower back only.',
    'Slamming into the full arch; press back smoothly to a strong finish.',
  ],
  superman_hold: [
    'Cranking your neck up to look forward; keep your gaze down, neck long.',
    'Kicking and flailing to stay up; lift arms and legs together and hold still.',
  ],
  prone_scapular_squeeze: [
    'Lifting your chest off the floor to raise the arms higher; only the arms and shoulder blades move.',
    'Rushing the letters; hold each Y, T, and W position for a beat.',
  ],
};

/** Form cues for an exercise, or undefined when none are authored. */
export function getFormCues(id: string): string[] | undefined {
  return FORM_CUES[id];
}
