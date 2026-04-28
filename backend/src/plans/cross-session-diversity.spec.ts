import {
  buildSessionDiversitySignature,
  classifyLowerDominance,
  classifyPullAngle,
  classifyPushAngle,
  compareSameFocusSessionPair,
  isUnilateralByName,
} from './cross-session-diversity';

describe('classifyPushAngle', () => {
  it('classifies flat bench variants as flat', () => {
    expect(classifyPushAngle('Barbell Bench Press')).toBe('flat');
    expect(classifyPushAngle('Dumbbell Bench Press')).toBe('flat');
    expect(classifyPushAngle('Bench Press')).toBe('flat');
    expect(classifyPushAngle('Push-Up')).toBe('flat');
    expect(classifyPushAngle('Dip')).toBe('flat');
  });

  it('classifies incline variants as incline', () => {
    expect(classifyPushAngle('Incline Dumbbell Press')).toBe('incline');
    expect(classifyPushAngle('Incline Barbell Bench Press')).toBe('incline');
    expect(classifyPushAngle('Low Incline Dumbbell Press')).toBe('incline');
  });

  it('classifies overhead variants as overhead even when name says incline shoulder', () => {
    expect(classifyPushAngle('Overhead Press')).toBe('overhead');
    expect(classifyPushAngle('Seated Dumbbell Shoulder Press')).toBe(
      'overhead',
    );
    expect(classifyPushAngle('Arnold Press')).toBe('overhead');
    expect(classifyPushAngle('Push Press')).toBe('overhead');
    expect(classifyPushAngle('Z Press')).toBe('overhead');
  });

  it('classifies decline / other correctly', () => {
    expect(classifyPushAngle('Decline Bench Press')).toBe('decline');
    expect(classifyPushAngle('Cable Lateral Raise')).toBe('other');
    expect(classifyPushAngle('Romanian Deadlift')).toBe('other');
    expect(classifyPushAngle(undefined)).toBe('other');
  });
});

describe('classifyPullAngle', () => {
  it('classifies pulldowns and pull-ups as vertical', () => {
    expect(classifyPullAngle('Pull-Up')).toBe('vertical');
    expect(classifyPullAngle('Lat Pulldown')).toBe('vertical');
    expect(classifyPullAngle('Chin Up')).toBe('vertical');
  });

  it('classifies rows as horizontal', () => {
    expect(classifyPullAngle('Bent Over Barbell Row')).toBe('horizontal');
    expect(classifyPullAngle('Chest Supported Row')).toBe('horizontal');
    expect(classifyPullAngle('T-Bar Row')).toBe('horizontal');
  });

  it('returns other for non-pull names', () => {
    expect(classifyPullAngle('Bench Press')).toBe('other');
    expect(classifyPullAngle(undefined)).toBe('other');
  });
});

describe('classifyLowerDominance', () => {
  it('classifies hinge variants as hinge', () => {
    expect(classifyLowerDominance('Romanian Deadlift')).toBe('hinge');
    expect(classifyLowerDominance('Conventional Deadlift')).toBe('hinge');
    expect(classifyLowerDominance('Hip Thrust')).toBe('hinge');
    expect(classifyLowerDominance('Cable Pull-Through')).toBe('hinge');
  });

  it('classifies squat variants as squat', () => {
    expect(classifyLowerDominance('Back Squat')).toBe('squat');
    expect(classifyLowerDominance('Front Squat')).toBe('squat');
    expect(classifyLowerDominance('Leg Press')).toBe('squat');
  });

  it('treats split squat / lunge family as lunge (overrides squat regex)', () => {
    expect(classifyLowerDominance('Bulgarian Split Squat')).toBe('lunge');
    expect(classifyLowerDominance('Walking Lunge')).toBe('lunge');
    expect(classifyLowerDominance('Step-Up')).toBe('lunge');
  });

  it('returns other for non-lower names', () => {
    expect(classifyLowerDominance('Bench Press')).toBe('other');
    expect(classifyLowerDominance(undefined)).toBe('other');
  });
});

describe('isUnilateralByName', () => {
  it('detects single-arm / single-leg / lunge variants', () => {
    expect(isUnilateralByName('Single-Arm Dumbbell Row')).toBe(true);
    expect(isUnilateralByName('Bulgarian Split Squat')).toBe(true);
    expect(isUnilateralByName('Walking Lunge')).toBe(true);
    expect(isUnilateralByName('Suitcase Carry')).toBe(true);
    expect(isUnilateralByName('Step-Up')).toBe(true);
  });

  it('returns false for bilateral compounds', () => {
    expect(isUnilateralByName('Back Squat')).toBe(false);
    expect(isUnilateralByName('Barbell Bench Press')).toBe(false);
    expect(isUnilateralByName(undefined)).toBe(false);
  });
});

describe('buildSessionDiversitySignature', () => {
  it('uses the first non-cardio row as slot 1 and detects unilateral elsewhere', () => {
    const primary = new Map([
      ['cardio_easy', 'Cardio'],
      ['bench', 'Chest'],
      ['lunge', 'Quadriceps'],
    ]);
    const sig = buildSessionDiversitySignature(
      [
        { exerciseId: 'cardio_easy', name: 'Easy Cycle' },
        { exerciseId: 'bench', name: 'Barbell Bench Press' },
        { exerciseId: 'lunge', name: 'Walking Lunge' },
      ],
      primary,
    );
    expect(sig.slotOneExerciseId).toBe('bench');
    expect(sig.slotOnePushAngle).toBe('flat');
    expect(sig.hasUnilateral).toBe(true);
  });
});

describe('compareSameFocusSessionPair', () => {
  it('flags two flat bench openers on Upper × 2', () => {
    const a = buildSessionDiversitySignature(
      [{ exerciseId: 'bench_a', name: 'Barbell Bench Press' }],
      new Map([['bench_a', 'Chest']]),
    );
    const b = buildSessionDiversitySignature(
      [{ exerciseId: 'bench_b', name: 'Dumbbell Bench Press' }],
      new Map([['bench_b', 'Chest']]),
    );
    const v = compareSameFocusSessionPair('upper', a, b);
    expect(v?.exerciseId).toBe('bench_b');
  });

  it('passes when Upper × 2 contrast flat vs incline', () => {
    const a = buildSessionDiversitySignature(
      [{ exerciseId: 'bench_a', name: 'Barbell Bench Press' }],
      new Map([['bench_a', 'Chest']]),
    );
    const b = buildSessionDiversitySignature(
      [{ exerciseId: 'incline_b', name: 'Incline Dumbbell Press' }],
      new Map([['incline_b', 'Chest']]),
    );
    expect(compareSameFocusSessionPair('upper', a, b)).toBeNull();
  });

  it('flags two squat-led Lower openers and demotes the second', () => {
    const a = buildSessionDiversitySignature(
      [{ exerciseId: 'sq_a', name: 'Back Squat' }],
      new Map([['sq_a', 'Quadriceps']]),
    );
    const b = buildSessionDiversitySignature(
      [{ exerciseId: 'sq_b', name: 'Front Squat' }],
      new Map([['sq_b', 'Quadriceps']]),
    );
    const v = compareSameFocusSessionPair('lower', a, b);
    expect(v?.exerciseId).toBe('sq_b');
    expect(v?.reason).toMatch(/squat/i);
  });

  it('passes when one Lower day is squat-led and the other hinge-led', () => {
    const a = buildSessionDiversitySignature(
      [{ exerciseId: 'sq', name: 'Back Squat' }],
      new Map([['sq', 'Quadriceps']]),
    );
    const b = buildSessionDiversitySignature(
      [{ exerciseId: 'rdl', name: 'Romanian Deadlift' }],
      new Map([['rdl', 'Hamstrings']]),
    );
    expect(compareSameFocusSessionPair('lower', a, b)).toBeNull();
  });

  it('flags exact same id reuse regardless of focus', () => {
    const a = buildSessionDiversitySignature(
      [{ exerciseId: 'sq', name: 'Back Squat' }],
      new Map([['sq', 'Quadriceps']]),
    );
    const b = buildSessionDiversitySignature(
      [{ exerciseId: 'sq', name: 'Back Squat' }],
      new Map([['sq', 'Quadriceps']]),
    );
    const v = compareSameFocusSessionPair('lower', a, b);
    expect(v?.exerciseId).toBe('sq');
  });
});
