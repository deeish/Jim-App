import { conformSessionTitleToExercises, shortLiftName } from './session-title';

const rows = (...names: string[]) => names.map((name) => ({ name }));

describe('shortLiftName', () => {
  it('names the lift the way a title would', () => {
    expect(shortLiftName('Flat Barbell Bench Press')).toBe('Bench');
    expect(shortLiftName('Barbell Bent-Over Row')).toBe('Row');
    expect(shortLiftName('Dumbbell Romanian Deadlift')).toBe('RDL');
    expect(shortLiftName('Trap Bar Deadlift')).toBe('Trap Bar');
    expect(shortLiftName('Barbell Hip Thrust')).toBe('Hip Thrust');
    expect(shortLiftName('Seated Dumbbell Shoulder Press')).toBe('Press');
    expect(shortLiftName('Wide-Grip Lat Pulldown')).toBe('Pulldown');
    expect(shortLiftName('Back Squat')).toBe('Squat');
    expect(shortLiftName('Power Clean')).toBe('Clean');
  });
  it('falls back to the last word', () => {
    expect(shortLiftName('Farmer Walk')).toBe('Walk');
  });
});

describe('conformSessionTitleToExercises', () => {
  it('leaves a name alone when every named lift is still in the session', () => {
    expect(
      conformSessionTitleToExercises(
        'Upper · Bench + Row',
        rows('Flat Barbell Bench Press', 'Barbell Bent-Over Row', 'Face Pull'),
      ),
    ).toBe('Upper · Bench + Row');
  });

  it('rebuilds the suffix when a named lift is gone (the review\'s "Press + Pull-Up" with no pull-up)', () => {
    expect(
      conformSessionTitleToExercises(
        'Upper · Press + Pull-Up',
        rows(
          'Flat Dumbbell Bench Press',
          'Single-Arm Dumbbell Row',
          'Seated Dumbbell Shoulder Press',
        ),
      ),
    ).toBe('Upper · Bench + Row');
  });

  it('rebuilds "Trap + Hip" after the trap-bar lift was swapped out', () => {
    expect(
      conformSessionTitleToExercises(
        'Lower · Trap + Hip',
        rows(
          'Dumbbell Romanian Deadlift',
          'Barbell Hip Thrust',
          'Goblet Squat',
        ),
      ),
    ).toBe('Lower · RDL + Hip Thrust');
  });

  it('does not repeat the same short name twice', () => {
    expect(
      conformSessionTitleToExercises(
        'Push · Bench + OHP',
        rows(
          'Flat Barbell Bench Press',
          'Incline Dumbbell Bench Press',
          'Cable Fly',
        ),
      ),
    ).toBe('Push · Bench + Incline');
  });

  it('leaves names without the lift suffix untouched', () => {
    expect(
      conformSessionTitleToExercises('Full Body', rows('Back Squat')),
    ).toBe('Full Body');
    expect(conformSessionTitleToExercises('Legs', rows())).toBe('Legs');
    expect(
      conformSessionTitleToExercises(undefined, rows('Back Squat')),
    ).toBeUndefined();
  });

  it('keeps the prefix when the session has no exercises', () => {
    expect(
      conformSessionTitleToExercises('Lower · Squat + Hinge', rows()),
    ).toBe('Lower');
  });
});
