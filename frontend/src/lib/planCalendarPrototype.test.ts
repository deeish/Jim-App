// The lib imports react-native (Platform) and expo-haptics at module scope;
// this jest setup has no RN transform, so both are stubbed out — the colour
// math under test is pure.
jest.mock('react-native', () => ({
  Platform: { OS: 'test', select: (o: { default?: unknown }) => o.default ?? {} },
}));
jest.mock('expo-haptics', () => ({}));

import {
  MUSCLE_COLORS,
  isWithinRescueWindow,
  mixWithWhite,
  movedToLabel,
  muscleGradient,
  nearestOpenIso,
  shortWeekday,
  upcomingDatesFrom,
  secondaryMusclesFromCatalog,
} from './planCalendarPrototype';

describe('mixWithWhite', () => {
  it('keeps the colour at fraction 1 and reaches white at 0', () => {
    expect(mixWithWhite('#38B6FF', 1)).toBe('#38b6ff');
    expect(mixWithWhite('#38B6FF', 0)).toBe('#ffffff');
  });

  it('mixes each channel toward white', () => {
    // R 0x38=56 → 56·0.62 + 255·0.38 = 131.62 → 132 (0x84)
    // G 0xB6=182 → 209.74 → 210 (0xd2); B 255 stays 255.
    expect(mixWithWhite('#38B6FF', 0.62)).toBe('#84d2ff');
  });

  it('pads low channels to two hex digits', () => {
    expect(mixWithWhite('#000000', 1)).toBe('#000000');
  });
});

describe('muscleGradient', () => {
  it('starts at the muscle colour and fades lighter (E2 Bright)', () => {
    const [from, to] = muscleGradient('Chest');
    expect(from).toBe(MUSCLE_COLORS.Chest);
    expect(to).toBe(mixWithWhite(MUSCLE_COLORS.Chest, 0.62));
  });

  it('leaves white (Cardio) white at both ends', () => {
    expect(muscleGradient('Cardio')).toEqual(['#FFFFFF', '#ffffff']);
  });
});

describe('isWithinRescueWindow', () => {
  const today = '2026-08-18';

  it('includes yesterday and the 7-day boundary, excludes today', () => {
    expect(isWithinRescueWindow('2026-08-17', today)).toBe(true);
    expect(isWithinRescueWindow('2026-08-11', today)).toBe(true); // exactly 7 back
    expect(isWithinRescueWindow(today, today)).toBe(false);
  });

  it('excludes older misses and the future', () => {
    expect(isWithinRescueWindow('2026-08-10', today)).toBe(false); // 8 back
    expect(isWithinRescueWindow('2026-08-19', today)).toBe(false);
  });

  it('handles the window crossing a month boundary', () => {
    expect(isWithinRescueWindow('2026-08-30', '2026-09-03')).toBe(true);
    expect(isWithinRescueWindow('2026-08-26', '2026-09-03')).toBe(false);
  });
});

describe('upcomingDatesFrom', () => {
  it('returns today plus the next six days', () => {
    expect(upcomingDatesFrom('2026-08-18')).toEqual([
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
    ]);
  });

  it('rolls across a month boundary', () => {
    expect(upcomingDatesFrom('2026-08-30', 3)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ]);
  });
});

describe('nearestOpenIso', () => {
  const days = (open: string[]) =>
    [
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
    ].map((dateIso) => ({ dateIso, open: open.includes(dateIso) }));

  it('picks the closest open day to the target', () => {
    expect(nearestOpenIso(days(['2026-08-19', '2026-08-23']), '2026-08-18')).toBe('2026-08-19');
    expect(nearestOpenIso(days(['2026-08-19', '2026-08-23']), '2026-08-22')).toBe('2026-08-23');
  });

  it('breaks ties toward the later (forward) day', () => {
    expect(nearestOpenIso(days(['2026-08-19', '2026-08-21']), '2026-08-20')).toBe('2026-08-21');
  });

  it('returns null when nothing is open', () => {
    expect(nearestOpenIso(days([]), '2026-08-20')).toBeNull();
  });
});

describe('movedToLabel / shortWeekday', () => {
  it('says today for a move onto today', () => {
    expect(movedToLabel('2026-08-18', '2026-08-18')).toBe('today');
  });

  it('uses the 3-letter weekday otherwise', () => {
    expect(movedToLabel('2026-08-19', '2026-08-18')).toBe('Wed');
    expect(shortWeekday('2026-08-17')).toBe('Mon');
    expect(shortWeekday('2026-08-23')).toBe('Sun');
  });
});

describe('secondaryMusclesFromCatalog', () => {
  it('maps the groups that name one muscle on their own', () => {
    expect(
      secondaryMusclesFromCatalog(['Shoulders', 'Core'], ['Push'], 'Chest'),
    ).toEqual(['Shoulders', 'Core']);
  });

  it('reads "Arms" off the movement: triceps on a push, biceps on a pull', () => {
    expect(secondaryMusclesFromCatalog(['Arms'], ['Push'], 'Chest')).toEqual(['Triceps']);
    expect(secondaryMusclesFromCatalog(['Arms'], ['Pull'], 'Back')).toEqual(['Biceps']);
  });

  it('reads "Legs" off the movement: hamstrings on a hinge, quads on a squat', () => {
    expect(secondaryMusclesFromCatalog(['Legs'], ['Hinge'], 'Back')).toEqual(['Hamstrings']);
    expect(secondaryMusclesFromCatalog(['Legs'], ['Squat'], 'Glutes')).toEqual(['Quads']);
    expect(secondaryMusclesFromCatalog(['Legs'], ['Lunge'], 'Glutes')).toEqual(['Quads']);
  });

  it('skips a group it cannot pin to one muscle rather than guessing', () => {
    // A carry works arms, but which? Crediting a guess would claim the session
    // trained something it may not have.
    expect(secondaryMusclesFromCatalog(['Arms'], ['Carry'], 'Core')).toEqual([]);
    expect(secondaryMusclesFromCatalog(['Legs'], ['Carry'], 'Core')).toEqual([]);
    expect(secondaryMusclesFromCatalog(['Arms', 'Legs'], [], 'Core')).toEqual([]);
    expect(secondaryMusclesFromCatalog(['Cardio'], ['Cardio'], 'Cardio')).toEqual([]);
  });

  it('never repeats the primary, or itself', () => {
    // A bench press listing Chest as both is one muscle, credited once.
    expect(secondaryMusclesFromCatalog(['Chest', 'Chest'], ['Push'], 'Chest')).toEqual([]);
    expect(secondaryMusclesFromCatalog(['Back', 'Back'], ['Pull'], 'Biceps')).toEqual(['Back']);
  });

  it('handles a missing list', () => {
    expect(secondaryMusclesFromCatalog(undefined, undefined, 'Chest')).toEqual([]);
  });
});
