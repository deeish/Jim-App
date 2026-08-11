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
export const CUE_COMPLETED_GROUPS: string[] = ['chest', 'cardio'];

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
};

/** Form cues for an exercise, or undefined when none are authored. */
export function getFormCues(id: string): string[] | undefined {
  return FORM_CUES[id];
}
