jest.mock('../services/exerciseService', () => ({ replaceExercise: jest.fn() }));
jest.mock('../services/planService', () => ({ generateSessions: jest.fn(), repairProgramSessions: jest.fn() }));

import type { PlanDraft, PlanInputs, SessionDraft } from '../types/plan';
import {
  daySummaryLine,
  leadLiftName,
  minutesLabel,
  progressionLine,
  removeDayFromDraft,
  shortPrescription,
  statedPlanLine,
  weekPhases,
} from './planPreviewEdits';

const strength: SessionDraft = {
  type: 'strength',
  title: 'Upper · Bench + Pulldown',
  focusTags: [],
  durationMin: 30,
  durationMax: 45,
  isHardDay: false,
  exercises: [
    { exerciseId: 'bench', name: 'Flat Barbell Bench Press', sets: 4, reps: '8–12', repsRaw: 8, repsMin: 8, repsMax: 12 },
    { exerciseId: 'pulldown', name: 'Wide-Grip Lat Pulldown', sets: 4, reps: '10–15', repsMin: 10, repsMax: 15 },
    { exerciseId: 'plank', name: 'Front Plank', sets: 2, reps: '40 sec', durationSeconds: 40, prescriptionType: 'time' },
  ],
};
const cardio: SessionDraft = {
  type: 'cardio',
  title: 'Conditioning',
  focusTags: [],
  durationMin: 25,
  durationMax: 25,
  isHardDay: false,
  exercises: [
    { exerciseId: 'jog', name: 'Treadmill Jog (Steady State)', sets: 1, reps: '25 min', durationSeconds: 1500, prescriptionType: 'time', primaryMuscleGroup: 'Cardio' },
    { exerciseId: 'plank', name: 'Front Plank', sets: 3, reps: '40 sec', durationSeconds: 40, prescriptionType: 'time', primaryMuscleGroup: 'Core' },
    { exerciseId: 'deadbug', name: 'Dead Bug', sets: 3, reps: '12', repsMin: 12, repsMax: 15, primaryMuscleGroup: 'Core' },
  ],
};
const draft = (): PlanDraft => ({
  draftId: 'd',
  inputsSnapshot: {} as PlanInputs,
  metrics: { sessionsPerWeek: 2, strengthCount: 1, cardioCount: 1, hardDaysCount: 0 },
  debugMeta: { effectiveSplitId: 'upper_lower' },
  weeks: [
    {
      weekIndex: 1,
      days: [
        { weekday: 'Monday', dateOrLabel: 'Week 1', session: strength },
        { weekday: 'Tuesday', dateOrLabel: 'Week 1', session: null },
        { weekday: 'Wednesday', dateOrLabel: 'Week 1', session: cardio },
      ],
    },
    { weekIndex: 2, days: [{ weekday: 'Monday', dateOrLabel: 'Week 2', session: strength }] },
  ],
});
const inputs = { durationMin: 30, durationMax: 45, daysPerWeek: 2, progressionStyle: 'build_deload', weeksCount: 2 } as PlanInputs;

describe('card copy', () => {
  it('a strength day names the lift that leads with its sets and reps, then the count', () => {
    expect(daySummaryLine(strength)).toBe('Bench press 4 × 8–12 leads · 3 exercises');
  });
  it('a cardio day names the block and the core moves', () => {
    expect(daySummaryLine(cardio)).toBe('25 min treadmill jog · 2 core moves');
  });
  it('a recovery day reads as easy work', () => {
    expect(daySummaryLine({ ...cardio, type: 'recovery', exercises: [] })).toBe('Mobility and easy movement');
  });
  it('short names drop the equipment words, prescriptions read as sets × range', () => {
    expect(leadLiftName('Seated Dumbbell Shoulder Press')).toBe('Shoulder press');
    expect(leadLiftName('Conventional Deadlift')).toBe('Deadlift');
    expect(shortPrescription(strength.exercises[2]!)).toBe('2 × 40 sec');
    expect(minutesLabel({ durationMin: 45, durationMax: 45 })).toBe('45 min');
  });
});

describe('the plan stated back', () => {
  it('comes from the draft, not the form', () => {
    expect(statedPlanLine(draft(), inputs)).toBe('2 weeks · Upper/Lower · 2 days · 30–45 min');
    expect(statedPlanLine({ ...draft(), debugMeta: { effectiveSplitId: 'custom' } }, inputs)).toBe(
      '2 weeks · Custom split · 2 days · 30–45 min',
    );
  });
  it('phases follow the progression table and the footer follows the style', () => {
    const phases = weekPhases(draft(), inputs);
    expect(Object.keys(phases)).toEqual(['1', '2']);
    expect(progressionLine(inputs)).toMatch(/deload/);
    expect(progressionLine({ ...inputs, progressionStyle: 'maintain' })).toMatch(/hold/i);
  });
});

describe('removeDayFromDraft', () => {
  it('turns one day of one week into a rest day and leaves the others alone', () => {
    const out = removeDayFromDraft(draft(), 1, 'Monday');
    expect(out.weeks[0]!.days[0]!.session).toBeNull();
    expect(out.weeks[1]!.days[0]!.session).toBe(strength);
  });
});
