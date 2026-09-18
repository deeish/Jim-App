"""Summarise a directory of generation captures: what each scenario produced, and a checklist of coaching defects."""
import json, os, sys, re, collections

d = sys.argv[1]
files = sorted(f for f in os.listdir(d) if f.endswith('.json'))
CALF = re.compile(r'\bcalf\b|\bcalves\b', re.I)
LIGHT = {'goblet_squat', 'bodyweight_squat', 'push_up', 'single_arm_dumbbell_row', 'dumbbell_romanian_deadlift'}
gym_like = lambda tags: any(re.search(r'barbell|cable|machine', t, re.I) for t in tags or [])


def rows_of(s):
    return [e for e in s['exercises'] if (e.get('primaryMuscleGroup') or '') != 'Cardio' and e.get('prescriptionType') != 'time']


for f in files:
    c = json.load(open(os.path.join(d, f), encoding='utf-8'))
    i, o, p = c['inputs'], c['outputs'], c['pipeline']
    label = c.get('meta', {}).get('run', {}).get('label') or f
    weeks = sorted(set(s['weekIndex'] for s in i['sessions']))
    strength_specs = [s for s in i['sessions'] if s['type'] == 'strength']
    print('=' * 100)
    print(f"{f} | {i.get('goal')} {i.get('experienceLevel')} {i.get('location')} | {len(strength_specs)//len(weeks)} lifting days, {len(weeks)} weeks, {i['sessions'][0]['durationMin']}-{i['sessions'][0]['durationMax']} min | priority {i.get('priorityMuscle')} | avoid {i.get('avoidConstraints')} | equip {i.get('equipmentTags')}")
    calls = c.get('meta', {}).get('groq', {})
    print(f"  llm calls {calls.get('groqCalls')} tokens {calls.get('total_tokens')} | model {calls.get('model')}")
    for ch in p.get('chunks', []):
        if ch.get('path') == 'clone':
            continue
        fp = ch.get('validatorFirstPass') or {}
        sp = ch.get('validatorSecondPass') or {}
        offenders = {k: v for k, v in fp.items() if v and k not in ('ok', 'issues')}
        print(f"  chunk wk{ch.get('weekMin')} path={ch.get('path')} first={fp.get('issues')} {offenders if offenders else ''} second={sp.get('issues') if sp else None}")
    print('  notes', o.get('generationNotes'))
    # coach check per week is not in the capture; recompute the simple things per week
    sessions = o['sessions']
    by_week = collections.defaultdict(list)
    for s in sessions:
        by_week[s['weekIndex']].append(s)
    defects = []
    for wk in weeks:
        ss = by_week[wk]
        for s in ss:
            spec = next((x for x in i['sessions'] if x['weekIndex'] == wk and x['weekday'] == s['weekday']), None)
            if not spec or spec['type'] != 'strength':
                continue
            rows = rows_of(s)
            if len(rows) < 4 and spec['durationMax'] >= 40:
                defects.append(f"wk{wk} {s['weekday']} {s['name']}: {len(rows)} lifts")
            calves = [e for e in rows if CALF.search(e.get('name') or '')]
            if len(calves) > 1:
                defects.append(f"wk{wk} {s['weekday']}: {len(calves)} calf exercises")
            ids = [e.get('exerciseId') for e in rows]
            if len(ids) != len(set(ids)):
                defects.append(f"wk{wk} {s['weekday']}: duplicate exercise")
            if rows and rows[0].get('exerciseId') in LIGHT and gym_like(i.get('equipmentTags')) and i.get('experienceLevel') != 'beginner' and not i.get('makeItEasier'):
                defects.append(f"wk{wk} {s['weekday']}: light opener {rows[0].get('exerciseId')}")
            for e in rows:
                if (e.get('sets') or 0) < 2:
                    defects.append(f"wk{wk} {s['weekday']}: {e.get('name')} at {e.get('sets')} sets")
                if (e.get('sets') or 0) > 6:
                    defects.append(f"wk{wk} {s['weekday']}: {e.get('name')} at {e.get('sets')} sets")
            for e in s['exercises']:
                if re.search(r'overhead|shoulder press|dip', e.get('name') or '', re.I) and i.get('avoidConstraints') and any('shoulder' in a for a in i['avoidConstraints']):
                    defects.append(f"wk{wk} {s['weekday']}: {e.get('name')} despite shoulder avoid")
                if re.search(r'lunge|split squat|deep', e.get('name') or '', re.I) and i.get('avoidConstraints') and any('knee' in a for a in i['avoidConstraints']):
                    defects.append(f"wk{wk} {s['weekday']}: {e.get('name')} despite knee avoid")
    # week 1 vs last week rows per title
    first, last = by_week[weeks[0]], by_week[weeks[-1]]
    for s1 in first:
        s2 = next((x for x in last if x['weekday'] == s1['weekday']), None)
        if s2 and len(rows_of(s2)) < len(rows_of(s1)):
            defects.append(f"{s1['weekday']} {s1['name']}: {len(rows_of(s1))} → {len(rows_of(s2))} lifts by wk{weeks[-1]}")
    # known lifts stamped?
    for k in i.get('knownLifts') or []:
        hit = [e for s in first for e in s['exercises'] if e.get('exerciseId') == k['exerciseId']]
        if hit and not any(e.get('weight') for e in hit):
            defects.append(f"known lift {k['exerciseId']} has no load in week 1")
    # progression trace: main lift of each week-1 strength day across weeks
    print('  progression (first lift): ', end='')
    trace = []
    for s1 in first:
        r = rows_of(s1)
        if not r:
            continue
        name = r[0].get('name')
        seq = []
        for wk in weeks:
            s = next((x for x in by_week[wk] if x['weekday'] == s1['weekday']), None)
            e = next((e for e in (s['exercises'] if s else []) if e.get('exerciseId') == r[0].get('exerciseId')), None)
            seq.append(f"{e.get('sets')}x{e.get('repsMin') or e.get('reps')}{('-' + str(e.get('repsMax'))) if e.get('repsMax') else ''}@{e.get('weight') or '-'}rir{e.get('targetRir')}" if e else '—')
        trace.append(f"{name}: " + ' | '.join(seq))
    print('; '.join(trace[:3]))
    for s in first:
        spec = next((x for x in i['sessions'] if x['weekIndex'] == weeks[0] and x['weekday'] == s['weekday']), None)
        rows = [f"{e.get('name')} {e.get('sets')}x{e.get('repsMin') or e.get('reps')}" if e.get('prescriptionType') != 'time' and (e.get('primaryMuscleGroup') or '') != 'Cardio' else f"{e.get('name')} {round((e.get('durationSeconds') or 0)/60)}min" for e in s['exercises']]
        print(f"  wk1 {s['weekday'][:3]} [{spec['type'] if spec else '?'}] {s['name']}: " + ', '.join(rows))
    print('  DEFECTS:', defects if defects else 'none')
