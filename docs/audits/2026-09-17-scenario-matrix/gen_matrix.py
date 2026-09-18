"""Scenario matrix for the plan generator: writes one GenerateSessionsDto payload per scenario."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), 'payloads')
os.makedirs(OUT, exist_ok=True)

GYM = ['dumbbells', 'barbell', 'cable', 'machines', 'kettlebells', 'bands', 'pull-up bar']
HOME = ['dumbbells', 'bands', 'bench', 'pull-up bar']
HOME_MIN = ['dumbbells', 'bands']
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


def progression(style, weeks):
    rows = []
    for wi in range(1, weeks + 1):
        if style == 'maintain':
            rows.append(dict(weekIndex=wi, phase='maintain', intensityPct=70, volumeMultiplier=1.0, repModifier=0))
        elif style == 'build_deload':
            r = [
                dict(phase='foundation', intensityPct=65, volumeMultiplier=1.0, repModifier=0),
                dict(phase='progression', intensityPct=70, volumeMultiplier=1.15, repModifier=0),
                dict(phase='peak', intensityPct=75, volumeMultiplier=1.25, repModifier=0),
                dict(phase='deload', intensityPct=60, volumeMultiplier=0.70, repModifier=2),
            ][(wi - 1) % 4]
            rows.append(dict(weekIndex=wi, **r))
        else:
            ramp = min(wi - 1, 3)
            rows.append(dict(weekIndex=wi, phase='foundation' if ramp == 0 else ('progression' if ramp < 3 else 'peak'),
                             intensityPct=65 + ramp * 4, volumeMultiplier=round(1.0 + ramp * 0.08, 2), repModifier=0))
    return rows


def sessions(days, weeks, dur, hard_every=2):
    """days: list of (weekdayIndex, title, type)."""
    out = []
    for wi in range(1, weeks + 1):
        for n, (di, title, typ) in enumerate(days):
            out.append(dict(type=typ, title=title, durationMin=dur[0], durationMax=dur[1],
                            isHardDay=(n % hard_every == 0) and typ == 'strength', weekIndex=wi, weekday=DAYS[di]))
    return out


def meso(weeks):
    return ('Progressive overload when recovery allows; small weekly bumps to load.'
            if weeks > 1 else 'One week: a complete, balanced week.')


S = {}
S['01_ppl6_muscle_int_gym_4w'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='intermediate', equipmentTags=GYM,
    sessions=sessions([(0, 'Push', 'strength'), (1, 'Pull', 'strength'), (2, 'Legs', 'strength'),
                       (3, 'Push 2', 'strength'), (4, 'Pull 2', 'strength'), (5, 'Legs 2', 'strength')], 4, (45, 60)),
    weekProgression=progression('build', 4), priorityMuscle='Chest', currentActivityLevel='3-4',
    knownLifts=[dict(exerciseId='flat_barbell_bench_press', weight=185, reps=6), dict(exerciseId='back_squat', weight=225, reps=5)])
S['02_ppl5_muscle_adv_gym_8w_deload'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='advanced', equipmentTags=GYM,
    sessions=sessions([(0, 'Push', 'strength'), (1, 'Pull', 'strength'), (2, 'Legs', 'strength'),
                       (4, 'Upper', 'strength'), (5, 'Lower', 'strength')], 8, (60, 75)),
    weekProgression=progression('build_deload', 8), priorityMuscle='Arms', currentActivityLevel='5+')
S['03_fullbody3_muscle_beg_gym_4w'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='beginner', equipmentTags=GYM,
    sessions=sessions([(0, 'Full Body', 'strength'), (2, 'Full Body', 'strength'), (4, 'Full Body', 'strength')], 4, (30, 45)),
    weekProgression=progression('build', 4), currentActivityLevel='0')
S['04_fullbody3_muscle_beg_home_1w'] = dict(
    goal='hypertrophy', location='home', experienceLevel='beginner', equipmentTags=HOME_MIN,
    sessions=sessions([(0, 'Full Body', 'strength'), (2, 'Full Body', 'strength'), (4, 'Full Body', 'strength')], 1, (30, 45)),
    weekProgression=progression('maintain', 1), currentActivityLevel='1-2')
S['05_ul4_muscle_int_home_4w_deload_shoulders'] = dict(
    goal='hypertrophy', location='home', experienceLevel='intermediate', equipmentTags=HOME,
    sessions=sessions([(0, 'Upper', 'strength'), (1, 'Lower', 'strength'), (3, 'Upper 2', 'strength'), (4, 'Lower 2', 'strength')], 4, (45, 60)),
    weekProgression=progression('build_deload', 4), priorityMuscle='Shoulders', currentActivityLevel='3-4')
S['06_fullbody3_strength_int_gym_8w'] = dict(
    goal='strength', location='gym', experienceLevel='intermediate', equipmentTags=GYM,
    sessions=sessions([(0, 'Full Body', 'strength'), (2, 'Full Body', 'strength'), (4, 'Full Body', 'strength')], 8, (60, 75)),
    weekProgression=progression('build', 8), currentActivityLevel='3-4',
    knownLifts=[dict(exerciseId='flat_barbell_bench_press', weight=205, reps=5), dict(exerciseId='back_squat', weight=275, reps=5),
                dict(exerciseId='conventional_deadlift', weight=315, reps=5)])
S['07_ul4_cardio1_fatloss_int_gym_4w'] = dict(
    goal='fat loss', location='gym', experienceLevel='intermediate', equipmentTags=GYM, cardioModalities=['run'],
    sessions=sessions([(0, 'Upper', 'strength'), (1, 'Lower', 'strength'), (2, 'Cardio', 'cardio'),
                       (3, 'Upper 2', 'strength'), (4, 'Lower 2', 'strength')], 4, (45, 60)),
    weekProgression=progression('build', 4), currentActivityLevel='1-2')
S['08_fb3_cardio2_balanced_beg_gym_4w_deload'] = dict(
    goal='balanced', location='gym', experienceLevel='beginner', equipmentTags=GYM, cardioModalities=['bike'],
    sessions=sessions([(0, 'Full Body', 'strength'), (1, 'Cardio', 'cardio'), (2, 'Full Body', 'strength'),
                       (3, 'Cardio', 'cardio'), (4, 'Full Body', 'strength')], 4, (30, 45)),
    weekProgression=progression('build_deload', 4), currentActivityLevel='1-2')
S['09_ppl6_muscle_adv_gym_8w_shoulderpain'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='advanced', equipmentTags=GYM,
    sessions=sessions([(0, 'Push', 'strength'), (1, 'Pull', 'strength'), (2, 'Legs', 'strength'),
                       (3, 'Push 2', 'strength'), (4, 'Pull 2', 'strength'), (5, 'Legs 2', 'strength')], 8, (60, 90)),
    weekProgression=progression('build_deload', 8), priorityMuscle='Back', currentActivityLevel='5+',
    avoidConstraints=['shoulder pain'], restrictions='Right shoulder impingement: no overhead pressing, no dips.',
    knownLifts=[dict(exerciseId='conventional_deadlift', weight=405, reps=3)])
S['10_ul4_muscle_int_gym_4w_knee'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='intermediate', equipmentTags=GYM,
    sessions=sessions([(0, 'Upper', 'strength'), (1, 'Lower', 'strength'), (3, 'Upper 2', 'strength'), (4, 'Lower 2', 'strength')], 4, (45, 60)),
    weekProgression=progression('build', 4), avoidConstraints=['knee'], restrictions='Left knee: no deep squats or lunges.',
    currentActivityLevel='3-4')
S['11_bro5_muscle_int_gym_4w'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='intermediate', equipmentTags=GYM,
    sessions=sessions([(0, 'Chest', 'strength'), (1, 'Back', 'strength'), (2, 'Shoulders', 'strength'),
                       (3, 'Legs', 'strength'), (4, 'Arms', 'strength')], 4, (45, 60)),
    weekProgression=progression('build', 4), currentActivityLevel='3-4')
S['12_fb3_cardio2_endurance_int_gym_4w_maintain'] = dict(
    goal='endurance', location='gym', experienceLevel='intermediate', equipmentTags=GYM, cardioModalities=['row', 'run'],
    sessions=sessions([(0, 'Full Body', 'strength'), (1, 'Cardio', 'cardio'), (2, 'Full Body', 'strength'),
                       (3, 'Cardio', 'cardio'), (5, 'Full Body', 'strength')], 4, (45, 60)),
    weekProgression=progression('maintain', 4), currentActivityLevel='3-4')
S['13_ul2_muscle_int_gym_4w'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='intermediate', equipmentTags=GYM,
    sessions=sessions([(0, 'Upper', 'strength'), (3, 'Lower', 'strength')], 4, (60, 75)),
    weekProgression=progression('build', 4), currentActivityLevel='1-2')
S['14_ul4_muscle_adv_gym_4w_simple'] = dict(
    goal='hypertrophy', location='gym', experienceLevel='advanced', equipmentTags=GYM, detailLevel='simple',
    sessions=sessions([(0, 'Upper', 'strength'), (1, 'Lower', 'strength'), (3, 'Upper 2', 'strength'), (4, 'Lower 2', 'strength')], 4, (45, 60)),
    weekProgression=progression('build', 4), currentActivityLevel='3-4', preferredExercises=['Front Squat', 'Incline Dumbbell Bench Press'])
S['15_fb3_muscle_int_home_bands_only_4w'] = dict(
    goal='hypertrophy', location='home', experienceLevel='intermediate', equipmentTags=['bands'],
    sessions=sessions([(0, 'Full Body', 'strength'), (2, 'Full Body', 'strength'), (4, 'Full Body', 'strength')], 4, (30, 45)),
    weekProgression=progression('build', 4), currentActivityLevel='3-4')
S['16_ul4_strength_beg_gym_4w_easier'] = dict(
    goal='strength', location='gym', experienceLevel='beginner', equipmentTags=GYM, makeItEasier=True,
    sessions=sessions([(0, 'Upper', 'strength'), (1, 'Lower', 'strength'), (3, 'Upper 2', 'strength'), (4, 'Lower 2', 'strength')], 4, (30, 45)),
    weekProgression=progression('build', 4), currentActivityLevel='0')

for name, body in S.items():
    weeks = max(s['weekIndex'] for s in body['sessions'])
    payload = dict(detailLevel=body.pop('detailLevel', 'detailed'), makeItEasier=body.pop('makeItEasier', False),
                   mesoHint=meso(weeks), **body)
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=1)
print('wrote', len(S), 'payloads to', OUT)
