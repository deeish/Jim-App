/**
 * Tests for the secondary-goal mapping through buildPlanInputs / planInputsToFormPatch.
 * Primary goal still drives rep ranges; secondary is an optional emphasis.
 */

import {
  buildPlanInputs,
  planInputsToFormPatch,
  type FormStateForPlanInputs,
} from './planInputs';

function baseForm(
  overrides: Partial<FormStateForPlanInputs> = {},
): FormStateForPlanInputs {
  return {
    goal: 'strength',
    programType: 'steady+lift',
    trainingDays: ['Monday', 'Wednesday', 'Friday'],
    startDateISO: '2026-06-29',
    timePerSession: { min: 45, max: 60 },
    primaryLocation: 'gym',
    weeks: 1,
    workoutDetailLevel: 'detailed',
    progressionStyle: 'build',
    maxHardDaysInRow: 1,
    maxHardDaysPerWeek: 2,
    avoidList: [],
    sessionCaps: {
      strength: { min: 45, max: 60 },
      cardio: { min: 20, max: 45 },
      recovery: { min: 10, max: 20 },
    },
    trainingSplitPreference: null,
    customSplit: null,
    experienceLevel: 'intermediate',
    ...overrides,
  };
}

describe('buildPlanInputs — secondaryGoal', () => {
  it('maps a hypertrophy + fat loss combo to primary strength + secondary fat_loss', () => {
    // The form collapses Hypertrophy → strength; fat loss → fat_loss.
    const inputs = buildPlanInputs({
      form: baseForm({ goal: 'strength', secondaryGoal: 'fat loss' }),
      effectiveSplitPreference: null,
      useRecommended: false,
    });
    expect(inputs.goal).toBe('strength');
    expect(inputs.secondaryGoal).toBe('fat_loss');
  });

  it('maps hybrid secondary to balanced', () => {
    const inputs = buildPlanInputs({
      form: baseForm({ goal: 'endurance', secondaryGoal: 'hybrid' }),
      effectiveSplitPreference: null,
      useRecommended: false,
    });
    expect(inputs.secondaryGoal).toBe('balanced');
  });

  it('leaves secondaryGoal undefined when none is chosen', () => {
    const inputs = buildPlanInputs({
      form: baseForm({ goal: 'strength', secondaryGoal: null }),
      effectiveSplitPreference: null,
      useRecommended: false,
    });
    expect(inputs.secondaryGoal).toBeUndefined();
  });

  it('round-trips secondaryGoal back to a form value for Edit Inputs', () => {
    const inputs = buildPlanInputs({
      form: baseForm({ goal: 'strength', secondaryGoal: 'fat loss' }),
      effectiveSplitPreference: null,
      useRecommended: false,
    });
    const patch = planInputsToFormPatch(inputs);
    expect(patch.secondaryGoal).toBe('fat loss');
  });

  it('round-trips a missing secondaryGoal to null', () => {
    const inputs = buildPlanInputs({
      form: baseForm({ goal: 'strength' }),
      effectiveSplitPreference: null,
      useRecommended: false,
    });
    const patch = planInputsToFormPatch(inputs);
    expect(patch.secondaryGoal).toBeNull();
  });
});
