import { getRoleAwareScheme, type ExerciseRole } from './set-rep-schemes';

describe('getRoleAwareScheme', () => {
  // The four goals the Generate Plan form actually sends.
  const goals = ['strength', 'hybrid', 'fat loss', 'endurance'] as const;
  const roles: ExerciseRole[] = [
    'primary_compound',
    'secondary_compound',
    'isolation',
    'core',
  ];

  it('keeps sets/reps within sane clamps for every goal × role', () => {
    for (const goal of goals) {
      for (const role of roles) {
        const s = getRoleAwareScheme(goal, 'intermediate', role);
        expect(s.repsMin).toBeGreaterThanOrEqual(3);
        expect(s.repsMax).toBeLessThanOrEqual(25);
        expect(s.repsMax).toBeGreaterThanOrEqual(s.repsMin);
        expect(s.sets).toBeGreaterThanOrEqual(2);
        expect(s.sets).toBeLessThanOrEqual(6);
      }
    }
  });

  it('goal drives the band: strength compound is low-rep, endurance is high-rep', () => {
    const strength = getRoleAwareScheme(
      'strength',
      'intermediate',
      'primary_compound',
    );
    const endurance = getRoleAwareScheme(
      'endurance',
      'intermediate',
      'primary_compound',
    );
    expect(strength.repsMax).toBeLessThanOrEqual(6);
    expect(endurance.repsMin).toBeGreaterThanOrEqual(12);
    expect(endurance.repsMin).toBeGreaterThan(strength.repsMax);
  });

  it('within a goal, isolation runs higher reps with fewer/equal sets than the heavy compound', () => {
    for (const goal of goals) {
      const compound = getRoleAwareScheme(
        goal,
        'intermediate',
        'primary_compound',
      );
      const isolation = getRoleAwareScheme(goal, 'intermediate', 'isolation');
      expect(isolation.repsMin).toBeGreaterThan(compound.repsMin);
      expect(isolation.sets).toBeLessThanOrEqual(compound.sets);
    }
  });

  it('never prescribes isolation work as a heavy low-rep set', () => {
    for (const goal of goals) {
      const isolation = getRoleAwareScheme(goal, 'intermediate', 'isolation');
      expect(isolation.repsMax).toBeGreaterThanOrEqual(10);
    }
  });

  it('uses a higher-rep band for core (>= 12 floor) across goals', () => {
    for (const goal of goals) {
      const core = getRoleAwareScheme(goal, 'intermediate', 'core');
      expect(core.repsMin).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps the band coach-tight (no range wider than 6 reps)', () => {
    const difficulties = ['beginner', 'intermediate', 'advanced'];
    for (const goal of goals) {
      for (const d of difficulties) {
        for (const role of roles) {
          const s = getRoleAwareScheme(goal, d, role);
          expect(s.repsMax - s.repsMin).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('difficulty still shifts the band (advanced strength is heavier than beginner)', () => {
    const beginner = getRoleAwareScheme(
      'strength',
      'beginner',
      'primary_compound',
    );
    const advanced = getRoleAwareScheme(
      'strength',
      'advanced',
      'primary_compound',
    );
    expect(advanced.repsMin).toBeLessThanOrEqual(beginner.repsMin);
  });
});
