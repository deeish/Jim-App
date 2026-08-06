import {
  estimateTemplateSessionMinutes,
  materializeTemplatePlan,
  orderWeekdays,
  suggestedTemplateStartDateISO,
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
  it('suggests today when today is Monday', () => {
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 10))).toBe(
      '2026-08-10',
    );
  });

  it('suggests next Monday from mid-week', () => {
    // Wednesday 2026-08-05 → Monday 2026-08-10.
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 5))).toBe(
      '2026-08-10',
    );
  });

  it('suggests next Monday from Sunday', () => {
    // Sunday 2026-08-09 → Monday 2026-08-10.
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 9))).toBe(
      '2026-08-10',
    );
  });

  it('suggests today when no selected training day this week has passed', () => {
    // Tuesday 2026-08-04 with a Tue/Thu/Sat program: nothing lost — start now.
    expect(
      suggestedTemplateStartDateISO(new Date(2026, 7, 4), ['Tuesday', 'Thursday', 'Saturday']),
    ).toBe('2026-08-04');
    // Monday is always clean, whatever the selection.
    expect(
      suggestedTemplateStartDateISO(new Date(2026, 7, 10), ['Wednesday', 'Friday']),
    ).toBe('2026-08-10');
    // Sunday with a Sunday-only program: the one session is still ahead.
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 9), ['Sunday'])).toBe('2026-08-09');
  });

  it('keeps next Monday when a selected day already passed this week', () => {
    // Wednesday 2026-08-05 with Monday in the program: week 1 would open with
    // a missed session — wait for the clean Monday.
    expect(
      suggestedTemplateStartDateISO(new Date(2026, 7, 5), ['Monday', 'Tuesday', 'Thursday', 'Friday']),
    ).toBe('2026-08-10');
    // Sunday with a Monday program: next Monday is tomorrow anyway.
    expect(suggestedTemplateStartDateISO(new Date(2026, 7, 9), ['Monday'])).toBe('2026-08-10');
  });
});

describe('materializeTemplatePlan', () => {
  const body = materializeTemplatePlan(template, {
    weekdays: ['Monday', 'Thursday'],
    startDateISO: '2026-08-12', // Wednesday
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

  it('rejects weekday selections that do not match days/week', () => {
    expect(() =>
      materializeTemplatePlan(template, {
        weekdays: ['Monday'],
        startDateISO: '2026-08-10',
      }),
    ).toThrow(/needs 2 training days/);
    expect(() =>
      materializeTemplatePlan(template, {
        weekdays: ['Monday', 'Monday'] as Weekday[],
        startDateISO: '2026-08-10',
      }),
    ).toThrow();
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
