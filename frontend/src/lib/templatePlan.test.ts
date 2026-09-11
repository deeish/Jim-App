import {
  defaultWeekdaysForCount,
  estimateTemplateSessionMinutes,
  firstSessionDateISO,
  materializeTemplatePlan,
  orderWeekdays,
  suggestedTemplateStartDateISO,
  supportedDayRange,
  toggleTemplateWeekday,
} from './templatePlan';
import type { PlanTemplateDetail } from '../services/templateService';
import type { Weekday } from '../types/plan';

function weekly8(
  base: { sets: number; repsMin?: number; repsMax?: number; durationSeconds?: number },
  overrides: Partial<Record<number, Partial<typeof base> & { note?: string }>> = {},
) {
  return Array.from({ length: 8 }, (_, i) => ({ ...base, ...(overrides[i] ?? {}) }));
}

const template: PlanTemplateDetail = {
  id: 'test-template',
  name: 'Test · Upper/Lower',
  tagline: 'test',
  goal: 'strength',
  goalId: 'strength',
  split: 'Upper / Lower',
  splitId: 'upper_lower',
  programTemplateId: 'upper-lower-4',
  daysPerWeek: 2,
  weeksCount: 8,
  experienceLevel: 'intermediate',
  defaultWeekdays: ['Monday', 'Thursday'],
  muscleFocus: ['Squat', 'Bench'],
  sessionMinutes: { min: 45, max: 75 },
  summary: [],
  progression: 'test',
  weekMeta: Array.from({ length: 8 }, (_, i) => ({
    weekNumber: i + 1,
    label: i === 7 ? 'Deload' : `Build ${i + 1}`,
    coachNote: 'note',
    intensity: i === 7 ? ('Easy' as const) : ('Medium' as const),
  })),
  sessions: [
    {
      key: 'upper',
      title: 'Upper',
      focus: 'Chest, back',
      exercises: [
        {
          exerciseId: 'flat_barbell_bench_press',
          name: 'Flat Barbell Bench Press',
          prescriptionType: 'reps',
          restSeconds: 210,
          note: 'Base cue.',
          weekly: weekly8(
            { sets: 4, repsMin: 5, repsMax: 5 },
            { 1: { sets: 5, note: 'Week 2 override.' } },
          ),
        },
        {
          exerciseId: 'barbell_bent_over_row',
          name: 'Barbell Bent-Over Row',
          prescriptionType: 'reps',
          restSeconds: 150,
          note: 'Row cue.',
          weekly: weekly8({ sets: 4, repsMin: 6, repsMax: 8 }),
        },
      ],
    },
    {
      key: 'lower',
      title: 'Lower',
      focus: 'Legs',
      exercises: [
        {
          exerciseId: 'back_squat',
          name: 'Back Squat',
          prescriptionType: 'reps',
          restSeconds: 210,
          weekly: weekly8({ sets: 4, repsMin: 5, repsMax: 5 }),
        },
        {
          exerciseId: 'front_plank',
          name: 'Front Plank',
          prescriptionType: 'time',
          restSeconds: 60,
          note: 'Plank cue.',
          weekly: weekly8({ sets: 3, durationSeconds: 45 }),
        },
      ],
    },
  ],
};

describe('orderWeekdays', () => {
  it('sorts into Monday-first calendar order', () => {
    expect(orderWeekdays(['Friday', 'Monday', 'Wednesday'])).toEqual([
      'Monday',
      'Wednesday',
      'Friday',
    ]);
  });
});

describe('toggleTemplateWeekday', () => {
  it('adds a day (kept sorted) while under the cap', () => {
    expect(toggleTemplateWeekday(['Monday'], 'Thursday', 2)).toEqual([
      'Monday',
      'Thursday',
    ]);
    expect(toggleTemplateWeekday(['Thursday'], 'Monday', 2)).toEqual([
      'Monday',
      'Thursday',
    ]);
  });

  it('removes an already-selected day', () => {
    expect(toggleTemplateWeekday(['Monday', 'Thursday'], 'Monday', 2)).toEqual([
      'Thursday',
    ]);
  });

  it('ignores additions past the days/week cap', () => {
    expect(
      toggleTemplateWeekday(['Monday', 'Thursday'], 'Friday', 2),
    ).toEqual(['Monday', 'Thursday']);
  });
});

describe('suggestedTemplateStartDateISO', () => {
  // A mid-week sign-up used to be pushed to "next Monday" whenever a chosen
  // day had passed, so a Tuesday sign-up waited six days. The partial first
  // week makes today always clean.
  it('is today, whatever the weekday', () => {
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 10))).toBe('2026-08-10'); // Monday
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 5))).toBe('2026-08-05'); // Wednesday
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 9))).toBe('2026-08-09'); // Sunday
  });

  it('is today even when a chosen day already passed this week', () => {
    expect(
      suggestedTemplateStartDateISO(new Date(2026, 7, 5), ['Monday', 'Tuesday', 'Thursday', 'Friday']),
    ).toBe('2026-08-05');
  });
});

describe('firstSessionDateISO', () => {
  it('is the start date when it is a chosen day', () => {
    expect(firstSessionDateISO('2026-08-10', ['Monday', 'Thursday'])).toBe('2026-08-10');
  });

  it('is the next chosen day after a mid-week start', () => {
    // Wednesday → Thursday.
    expect(firstSessionDateISO('2026-08-12', ['Monday', 'Thursday'])).toBe('2026-08-13');
  });

  it('rolls into the next week when every chosen day has passed', () => {
    // Sunday 2026-08-16 → Monday 2026-08-17.
    expect(firstSessionDateISO('2026-08-16', ['Monday', 'Thursday'])).toBe('2026-08-17');
  });

  it('is null with no chosen days', () => {
    expect(firstSessionDateISO('2026-08-12', [])).toBeNull();
  });
});

describe('materializeTemplatePlan (partial first week)', () => {
  it('schedules nothing before a mid-week start and keeps the rotation continuous', () => {
    const body = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-12', // Wednesday: Monday has passed
    });
    // Week 1 holds only Thursday; the block is 15 sessions, not 16.
    expect(body.slots).toHaveLength(15);
    const week1 = body.slots.filter((s) => s.weekNumber === 1);
    expect(week1.map((s) => [s.dayOfWeek, s.title])).toEqual([['Thursday', 'Upper']]);
    // Nothing in the split is skipped: week 2 continues with Lower.
    const week2 = body.slots.filter((s) => s.weekNumber === 2);
    expect(week2.map((s) => [s.dayOfWeek, s.title])).toEqual([
      ['Monday', 'Lower'],
      ['Thursday', 'Upper'],
    ]);
    // Week 1 is still the start date's week.
    expect(body.weekAnchorMonday).toBe('2026-08-10');
  });

  it('starts the following week when every chosen day of the start week has passed', () => {
    const body = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-16', // Sunday
    });
    expect(body.weekAnchorMonday).toBe('2026-08-17');
    expect(body.slots).toHaveLength(16);
    const week1 = body.slots.filter((s) => s.weekNumber === 1);
    expect(week1.map((s) => [s.dayOfWeek, s.title])).toEqual([
      ['Monday', 'Upper'],
      ['Thursday', 'Lower'],
    ]);
  });

  it('passes the work-arounds through for the server to honour', () => {
    const body = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-10',
      limitations: ['knees', 'lower back'],
    });
    expect(body.limitations).toEqual(['knees', 'lower back']);
    // The server only rewrites rows when asked; a template apply asks.
    expect(body.applyWorkarounds).toBe(true);
    const without = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-10',
    });
    expect(without.limitations).toBeUndefined();
    expect(without.applyWorkarounds).toBeUndefined();
    expect(without.equipment).toBeUndefined();
  });

  it('passes the equipment through so replacements stay doable', () => {
    const body = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-10',
      equipment: ['Dumbbell', 'Bodyweight'],
    });
    expect(body.equipment).toEqual(['Dumbbell', 'Bodyweight']);
  });
});

describe('materializeTemplatePlan', () => {
  const body = materializeTemplatePlan(template, {
    weekdays: ['Monday', 'Thursday'],
    startDateISO: '2026-08-10', // Monday: a full first week
  });

  it('creates weeks × sessions slots mapped onto the chosen weekdays', () => {
    expect(body.slots).toHaveLength(16);
    const week1 = body.slots.filter((s) => s.weekNumber === 1);
    expect(week1.map((s) => s.dayOfWeek)).toEqual(['Monday', 'Thursday']);
    expect(week1.map((s) => s.title)).toEqual(['Upper', 'Lower']);
  });

  it('anchors week 1 to the Monday of the start week', () => {
    expect(body.weekAnchorMonday).toBe('2026-08-10');
  });

  it('carries the plan-level metadata the app expects', () => {
    expect(body.name).toBe('Test · Upper/Lower');
    expect(body.goal).toBe('strength');
    expect(body.experience).toBe('intermediate');
    expect(body.programTemplateId).toBe('upper-lower-4');
  });

  it('persists rep rows with reps === repsMin plus the range', () => {
    const bench = body.slots[0].exercises![0];
    expect(bench).toMatchObject({
      exerciseId: 'flat_barbell_bench_press',
      sets: 4,
      reps: 5,
      repsMin: 5,
      repsMax: 5,
      prescriptionType: 'reps',
      orderIndex: 0,
    });
    expect(bench.durationSeconds).toBeUndefined();
  });

  it('persists time rows with reps === durationSeconds and no range', () => {
    const plank = body.slots[1].exercises![1];
    expect(plank).toMatchObject({
      exerciseId: 'front_plank',
      sets: 3,
      reps: 45,
      durationSeconds: 45,
      prescriptionType: 'time',
    });
    expect(plank.repsMin).toBeUndefined();
    expect(plank.repsMax).toBeUndefined();
  });

  it('renders base note + rest exactly once, week note overriding', () => {
    const benchW1 = body.slots[0].exercises![0];
    expect(benchW1.notes).toBe('Base cue. Rest ~3m 30s.');
    const benchW2 = body.slots
      .find((s) => s.weekNumber === 2 && s.title === 'Upper')!
      .exercises![0];
    expect(benchW2.notes).toBe('Week 2 override. Rest ~3m 30s.');
    expect(benchW2.notes!.match(/Rest ~/g)).toHaveLength(1);
    // Week-2 set bump from the override is materialized.
    expect(benchW2.sets).toBe(5);
  });

  it('stamps week labels into slot detail lines and weekMeta intensity', () => {
    expect(body.slots[0].detailLine).toBe('Wk 1: Build 1');
    const deload = body.slots.find((s) => s.weekNumber === 8)!;
    expect(deload.detailLine).toBe('Wk 8: Deload');
    expect(deload.intensity).toBe('Easy');
  });

  it('without supportedDaysPerWeek, only the authored count is accepted', () => {
    // Old-backend fallback: the range collapses to the authored count.
    expect(() =>
      materializeTemplatePlan(template, {
        weekdays: ['Monday'],
        startDateISO: '2026-08-10',
      }),
    ).toThrow(/supports 2–2 training days/);
    expect(() =>
      materializeTemplatePlan(template, {
        weekdays: ['Monday', 'Monday'] as Weekday[],
        startDateISO: '2026-08-10',
      }),
    ).toThrow();
  });
});

describe('adjustable days/week', () => {
  const adjustable: PlanTemplateDetail = {
    ...template,
    supportedDaysPerWeek: { min: 2, max: 3 },
  };

  it('supportedDayRange falls back to the authored count', () => {
    expect(supportedDayRange(template)).toEqual({ min: 2, max: 2 });
    expect(supportedDayRange(adjustable)).toEqual({ min: 2, max: 3 });
  });

  it('defaultWeekdaysForCount keeps authored defaults at the authored count', () => {
    expect(defaultWeekdaysForCount(adjustable, 2)).toEqual([
      'Monday',
      'Thursday',
    ]);
    expect(defaultWeekdaysForCount(adjustable, 3)).toEqual([
      'Monday',
      'Wednesday',
      'Friday',
    ]);
    expect(defaultWeekdaysForCount(adjustable, 5)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
  });

  it('rejects counts outside the supported range', () => {
    expect(() =>
      materializeTemplatePlan(adjustable, {
        weekdays: ['Monday'],
        startDateISO: '2026-08-10',
      }),
    ).toThrow(/supports 2–3 training days/);
    expect(() =>
      materializeTemplatePlan(adjustable, {
        weekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
        startDateISO: '2026-08-10',
      }),
    ).toThrow(/supports 2–3 training days/);
  });

  it('rotates sessions in order across week boundaries at a non-authored count', () => {
    const body = materializeTemplatePlan(adjustable, {
      weekdays: ['Monday', 'Wednesday', 'Friday'],
      startDateISO: '2026-08-10',
    });
    // 8 weeks × 3 days — every training day gets a session.
    expect(body.slots).toHaveLength(24);
    // The 2-session cycle rolls continuously: U L U | L U L | U L U | …
    const titles = body.slots.map((s) => s.title);
    expect(titles.slice(0, 6)).toEqual([
      'Upper',
      'Lower',
      'Upper',
      'Lower',
      'Upper',
      'Lower',
    ]);
    // Week 2 starts where week 1 left off (Lower), not back at Upper.
    const week2 = body.slots.filter((s) => s.weekNumber === 2);
    expect(week2.map((s) => s.title)).toEqual(['Lower', 'Upper', 'Lower']);
    expect(week2.map((s) => s.dayOfWeek)).toEqual([
      'Monday',
      'Wednesday',
      'Friday',
    ]);
    // Over the block the rotation stays balanced: 12 of each session.
    expect(titles.filter((t) => t === 'Upper')).toHaveLength(12);
    expect(titles.filter((t) => t === 'Lower')).toHaveLength(12);
  });

  it('prescriptions stay calendar-anchored under rotation', () => {
    const body = materializeTemplatePlan(adjustable, {
      weekdays: ['Monday', 'Wednesday', 'Friday'],
      startDateISO: '2026-08-10',
    });
    // The bench override lives on program week 2 — every Upper slot in
    // calendar week 2 gets it, whichever rotation position it holds.
    const week2Uppers = body.slots.filter(
      (s) => s.weekNumber === 2 && s.title === 'Upper',
    );
    expect(week2Uppers.length).toBeGreaterThan(0);
    for (const slot of week2Uppers) {
      expect(slot.exercises![0].sets).toBe(5);
      expect(slot.exercises![0].notes).toContain('Week 2 override.');
    }
    // Upper slots in other weeks keep the 4-set baseline.
    const week1Upper = body.slots.find(
      (s) => s.weekNumber === 1 && s.title === 'Upper',
    )!;
    expect(week1Upper.exercises![0].sets).toBe(4);
  });

  it('at the authored count the rotation is the classic per-weekday layout', () => {
    const classic = materializeTemplatePlan(adjustable, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-10',
    });
    const legacy = materializeTemplatePlan(template, {
      weekdays: ['Monday', 'Thursday'],
      startDateISO: '2026-08-10',
    });
    expect(classic).toEqual(legacy);
    const week1 = classic.slots.filter((s) => s.weekNumber === 1);
    expect(week1.map((s) => s.title)).toEqual(['Upper', 'Lower']);
  });
});

describe('estimateTemplateSessionMinutes', () => {
  it('is rest-aware and bounded', () => {
    const upper = template.sessions[0];
    const est = estimateTemplateSessionMinutes(upper, 0);
    // 4 sets clamped at 3.5 min (anchor) + 4×~3.2 min (row) + buffers ≈ 33.
    expect(est).toBeGreaterThanOrEqual(30);
    expect(est).toBeLessThanOrEqual(45);
    // Week 2 adds a bench set → longer or equal.
    expect(estimateTemplateSessionMinutes(upper, 1)).toBeGreaterThanOrEqual(est);
  });
});
