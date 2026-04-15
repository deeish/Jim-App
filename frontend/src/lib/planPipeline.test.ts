/**
 * Automated tests for the plan generation pipeline.
 * Split mapping, 7-day rule, selected weekdays, hard day limits, avoid list.
 */

jest.mock('../services/planService', () => ({
  generateSessions: jest.fn((req: { sessions: Array<{ weekIndex: number; weekday: string }> }) =>
    Promise.resolve({
      sessions: req.sessions.map((s) => ({
        weekIndex: s.weekIndex,
        weekday: s.weekday,
        name: `Generated ${s.weekday}`,
        reasoning: 'Test reasoning',
        warmUp: 'Warm up',
        coolDown: 'Cool down',
        exercises: [{ name: 'Exercise 1', sets: 3, reps: 10, exerciseId: null }],
      })),
    })
  ),
}));

import {
  runPipeline,
  runPipelineSafe,
  validateDraft,
  repairDraft,
  planDraftToWeekPlans,
  sessionDraftToPlanSlotExercises,
  formatExerciseRepsDisplay,
  type PipelineDebugInfo,
} from './planPipeline';
import { isTimeHoldExerciseName } from './exercisePrescription';
import type { PlanInputs, SessionDraft, Weekday } from '../types/plan';

const MON: Weekday = 'Monday';
const TUE: Weekday = 'Tuesday';
const WED: Weekday = 'Wednesday';
const THU: Weekday = 'Thursday';
const FRI: Weekday = 'Friday';
const SAT: Weekday = 'Saturday';
const SUN: Weekday = 'Sunday';

function baseInputs(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return {
    goal: 'strength',
    selectedWeekdays: [MON, TUE, THU, FRI],
    daysPerWeek: 4,
    durationMode: 'fixed',
    durationMin: 45,
    durationMax: 60,
    planStyleId: 'heavy_compounds',
    splitPreference: 'upper_lower',
    useRecommended: false,
    customSplit: null,
    location: 'gym',
    weeksCount: 1,
    detailLevel: 'simple',
    progressionStyle: 'build',
    durationOverrides: null,
    hardDayLimits: { enabled: false, maxHardDaysPerWeek: 3, maxHardDaysInARow: 2 },
    injuriesAvoid: { bodyAreas: [], movementsOrEquipment: [] },
    currentActivityLevel: null,
    preferredExercises: [],
    ...overrides,
  };
}

describe('planPipeline', () => {
  describe('sessionDraftToPlanSlotExercises', () => {
    it('coerces zero sets to 1 when exercise has a name (backend @Min(1))', () => {
      const session: SessionDraft = {
        type: 'strength',
        title: 'Test',
        focusTags: [],
        durationMin: 45,
        durationMax: 45,
        isHardDay: false,
        exercises: [{ exerciseId: null, name: 'Squat', sets: 0, reps: '5' }],
      };
      const out = sessionDraftToPlanSlotExercises(session, 1, 'Monday');
      expect(out).toBeDefined();
      expect(out!).toHaveLength(1);
      expect(out![0].sets).toBe(1);
      expect(out![0].reps).toBeGreaterThanOrEqual(1);
    });

    it('attaches applyExercises on planDraftToWeekPlans cards', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, TUE],
        daysPerWeek: 2,
        splitPreference: 'upper_lower',
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      const mon = weekPlans[0].workouts[MON][0];
      expect(mon?.applyExercises?.length).toBeGreaterThan(0);
    });
  });

  describe('Split mapping', () => {
    it('U/L for 4 days → Upper/Lower cycle with numbered variants on repeats', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, TUE, THU, FRI],
        daysPerWeek: 4,
        splitPreference: 'upper_lower',
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      const titles = [
        weekPlans[0].workouts[MON][0]?.title,
        weekPlans[0].workouts[TUE][0]?.title,
        weekPlans[0].workouts[THU][0]?.title,
        weekPlans[0].workouts[FRI][0]?.title,
      ].filter(Boolean);
      expect(titles).toEqual(['Upper', 'Lower', 'Upper 2', 'Lower 2']);
    });

    it('PPL for 5 days rotates with numbered variants on second Push/Pull', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, TUE, WED, FRI, SAT],
        daysPerWeek: 5,
        splitPreference: 'ppl',
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      const titles = [
        weekPlans[0].workouts[MON][0]?.title,
        weekPlans[0].workouts[TUE][0]?.title,
        weekPlans[0].workouts[WED][0]?.title,
        weekPlans[0].workouts[FRI][0]?.title,
        weekPlans[0].workouts[SAT][0]?.title,
      ].filter(Boolean);
      expect(titles).toEqual(['Push', 'Pull', 'Legs', 'Push 2', 'Pull 2']);
    });

    it('Custom templates map in order with repeat_weekly cycleMode (repeats get numbered)', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, WED, FRI],
        daysPerWeek: 3,
        splitPreference: 'custom',
        customSplit: {
          name: 'Custom 2',
          dayTemplates: [
            { primaryGroups: ['Push'], secondaryGroups: [] },
            { primaryGroups: ['Pull'], secondaryGroups: [] },
          ],
          cycleMode: 'repeat_weekly',
          absPreference: 'none',
          cardioPreference: 'none',
        },
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      expect(weekPlans[0].workouts[MON][0]?.title).toBe('Push');
      expect(weekPlans[0].workouts[WED][0]?.title).toBe('Pull');
      expect(weekPlans[0].workouts[FRI][0]?.title).toBe('Push 2');
    });

    it('Custom templates with rotate_forward cycleMode advance by week', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, WED],
        daysPerWeek: 2,
        splitPreference: 'custom',
        weeksCount: 2,
        customSplit: {
          dayTemplates: [
            { primaryGroups: ['A'], secondaryGroups: [] },
            { primaryGroups: ['B'], secondaryGroups: [] },
          ],
          cycleMode: 'rotate_forward',
          absPreference: 'none',
          cardioPreference: 'none',
        },
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      const week1Mon = weekPlans[0].workouts[MON][0]?.title;
      const week2Mon = weekPlans[1].workouts[MON][0]?.title;
      expect(week1Mon).toBe('A');
      expect(week2Mon).toBe('B');
    });
  });

  describe('7-day rule', () => {
    it('ensures at least one recovery/rest day when 7 days selected', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, TUE, WED, THU, FRI, SAT, SUN],
        daysPerWeek: 7,
        splitPreference: 'upper_lower',
      });
      const draft = runPipeline(inputs, 'test-draft');
      const week = draft.weeks[0];
      const sessionTypes = week.days.map((d) => (d.session ? d.session.type : 'rest'));
      const restOrRecoveryCount = sessionTypes.filter((t) => t === 'rest' || t === 'recovery').length;
      expect(restOrRecoveryCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Selected weekdays correctness', () => {
    it('no workouts appear on unselected days', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, WED, FRI],
        daysPerWeek: 3,
        splitPreference: 'full_body',
      });
      const draft = runPipeline(inputs, 'test-draft');
      const weekPlans = planDraftToWeekPlans(draft);
      const w0 = weekPlans[0].workouts;
      expect(w0.Tuesday?.length ?? 0).toBe(0);
      expect(w0.Thursday?.length ?? 0).toBe(0);
      expect(w0.Saturday?.length ?? 0).toBe(0);
      expect(w0.Sunday?.length ?? 0).toBe(0);
      expect((w0.Monday?.length ?? 0) + (w0.Wednesday?.length ?? 0) + (w0.Friday?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Hard day limits', () => {
    it('when enabled max hard days/week = 2, output respects it', () => {
      const inputs = baseInputs({
        selectedWeekdays: [MON, TUE, WED, THU, FRI],
        daysPerWeek: 5,
        splitPreference: 'upper_lower',
        hardDayLimits: { enabled: true, maxHardDaysPerWeek: 2, maxHardDaysInARow: 1 },
      });
      const draft = runPipeline(inputs, 'test-draft');
      const week = draft.weeks[0];
      let hardCount = 0;
      week.days.forEach((d) => {
        if (d.session?.isHardDay) hardCount++;
      });
      expect(hardCount).toBeLessThanOrEqual(2);
    });
  });

  describe('Avoid list', () => {
    it('avoid list is passed into session specs as avoidConstraints', async () => {
      const inputs = baseInputs({
        injuriesAvoid: {
          bodyAreas: ['shoulders'],
          movementsOrEquipment: ['avoid overhead', 'avoid barbell'],
        },
      });
      const result = await runPipelineSafe(inputs, 'test-draft', { captureDebug: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const debug = result.debug as PipelineDebugInfo;
      const specs = debug.sessionSpecs.flatMap((ws) => ws.specs).filter((s): s is NonNullable<typeof s> => s != null);
      const withAvoid = specs.filter((s) => s.avoidConstraints?.length);
      expect(withAvoid.length).toBeGreaterThan(0);
      const first = withAvoid[0];
      expect(first.avoidConstraints).toContain('shoulders');
      expect(first.avoidConstraints).toContain('avoid overhead');
      expect(first.avoidConstraints).toContain('avoid barbell');
    });
  });

  describe('validateDraft / repairDraft', () => {
    it('validateDraft rejects draft with wrong number of days', () => {
      const inputs = baseInputs();
      const draft = runPipeline(inputs, 'test-draft');
      const broken = { ...draft, weeks: [{ ...draft.weeks[0], days: draft.weeks[0].days.slice(0, 5) }] };
      const { valid, errors } = validateDraft(broken);
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('7 days'))).toBe(true);
    });

    it('repairDraft fills missing days with rest', () => {
      const inputs = baseInputs();
      const draft = runPipeline(inputs, 'test-draft');
      const broken = { ...draft, weeks: [{ ...draft.weeks[0], days: draft.weeks[0].days.slice(0, 5) }] };
      const repaired = repairDraft(broken);
      expect(repaired.weeks[0].days.length).toBe(7);
      expect(repaired.weeks[0].days[5].weekday).toBe('Saturday');
      expect(repaired.weeks[0].days[5].session).toBeNull();
    });
  });

  describe('runPipelineSafe', () => {
    it('returns ok: true with draft and optional debug', async () => {
      const result = await runPipelineSafe(baseInputs(), 'test-draft', { captureDebug: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.draft.draftId).toBe('test-draft');
      expect(result.draft.weeks.length).toBe(1);
      expect(result.debug).toBeDefined();
      expect(result.debug?.planInputs).toBeDefined();
      expect(result.debug?.weekSkeleton).toBeDefined();
      expect(result.debug?.sessionSpecs).toBeDefined();
      expect(result.debug?.normalizationWarnings).toBeDefined();
    });

    it('repairIfInvalid repairs and returns ok', async () => {
      const inputs = baseInputs();
      const result = await runPipelineSafe(inputs, 'test-draft', { repairIfInvalid: true });
      expect(result.ok).toBe(true);
    });
  });

  describe('time-hold prescription display', () => {
    it('detects dead hang and similar holds', () => {
      expect(isTimeHoldExerciseName('Dead Hang')).toBe(true);
      expect(isTimeHoldExerciseName('Passive Hang')).toBe(true);
      expect(isTimeHoldExerciseName('Wall Sit')).toBe(true);
      expect(isTimeHoldExerciseName('Flat Dumbbell Bench Press')).toBe(false);
    });

    it('shows seconds range for holds instead of rep range', () => {
      expect(formatExerciseRepsDisplay('Dead Hang', 10, 'strength')).toBe('20–45 sec');
      expect(formatExerciseRepsDisplay('Bench Press', 10, 'strength')).toMatch(/\d+–\d+/);
    });

    it('uses prescriptionType from API when name alone would not match hold heuristics', () => {
      expect(formatExerciseRepsDisplay('Custom Bracing Drill', 10, 'strength', 'time')).toBe(
        '20–45 sec',
      );
    });

    it('apply path stores scalar reps and note for holds', () => {
      const session: SessionDraft = {
        type: 'strength',
        title: 'Upper',
        focusTags: [],
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
        exercises: [
          { exerciseId: 'x', name: 'Dead Hang', sets: 4, reps: '20–45 sec', notes: undefined },
        ],
      };
      const slots = sessionDraftToPlanSlotExercises(session, 1, 'Monday');
      expect(slots?.[0]?.reps).toBe(45);
      expect(slots?.[0]?.notes).toContain('Time-based');
    });

    it('apply path treats prescriptionType time like a hold even without hold-like name', () => {
      const session: SessionDraft = {
        type: 'strength',
        title: 'Core',
        focusTags: [],
        durationMin: 30,
        durationMax: 45,
        isHardDay: false,
        exercises: [
          {
            exerciseId: 'iso_x',
            name: 'Custom Bracing Drill',
            sets: 3,
            reps: '10',
            prescriptionType: 'time',
          },
        ],
      };
      const slots = sessionDraftToPlanSlotExercises(session, 1, 'Monday');
      expect(slots?.[0]?.reps).toBe(45);
      expect(slots?.[0]?.notes).toContain('Time-based');
      expect(slots?.[0]?.prescriptionType).toBe('time');
    });
  });
});
