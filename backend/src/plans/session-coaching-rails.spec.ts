import {
  coachCopyToneBlock,
  sessionCoachingRailLine,
} from './session-coaching-rails';

describe('sessionCoachingRailLine', () => {
  it('push strength mentions press patterns', () => {
    const s = sessionCoachingRailLine({
      focusLabel: 'Push',
      sessionType: 'strength',
      goal: 'hypertrophy',
      experienceLevel: 'intermediate',
    });
    expect(s.toLowerCase()).toMatch(/horizontal|vertical/);
    expect(s.toLowerCase()).toMatch(/deadlift|lower|legs/);
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it('cardio session uses aerobic framing', () => {
    const s = sessionCoachingRailLine({
      focusLabel: 'Cardio',
      sessionType: 'cardio',
      goal: 'fat loss',
    });
    expect(s.toLowerCase()).toMatch(/aerobic/);
  });

  it('strength finisher flag mentions cardio finisher last', () => {
    expect(
      sessionCoachingRailLine({
        focusLabel: 'Upper',
        sessionType: 'strength',
        goal: 'hypertrophy',
        wantsStrengthCardioFinisher: true,
      }),
    ).toMatch(/finisher last/i);
  });
});

describe('coachCopyToneBlock', () => {
  it('anchors programSummary and discourages hype', () => {
    const b = coachCopyToneBlock();
    expect(b).toMatch(/programSummary/i);
    expect(b).toMatch(/hype/i);
    expect(b.toLowerCase()).toMatch(/first two priority/);
  });
});
