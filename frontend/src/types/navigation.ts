/**
 * Navigation param lists. Kept in a separate file to avoid circular dependency
 * that causes "Cannot read properties of null (reading 'useMemo')" on load.
 */

import type { PlanInputs } from './plan';

export type RootNavigatorParamList = {
  Onboarding: undefined;
  Main: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Home: undefined;
  Plan: undefined;
  PlanList: { openSaved?: boolean } | undefined;
  Workout: undefined;
  Search: {
    addToPlan?: {
      day: string;
      weekIndex: number;
      weekMondayIso: string;
      /** From Plan tab — program week math without an extra GET. */
      weekAnchorMonday?: string | null;
    };
    addToWorkout?: { workoutId: string; workoutName: string; existingExerciseIds?: string[] };
  } | undefined;
  SearchList: {
    addToPlan?: {
      day: string;
      weekIndex: number;
      weekMondayIso: string;
      weekAnchorMonday?: string | null;
    };
    addToWorkout?: { workoutId: string; workoutName: string; existingExerciseIds?: string[] };
  } | undefined;
  WeeklyWorkout: undefined;
  ExerciseDetail: {
    exerciseId: string;
    /**
     * Opened from Plan Preview or Plan calendar workout sheet; Back resets Exercises stack to SearchList
     * and focuses the Exercises tab.
     */
    returnToPlanExerciseContext?: 'preview' | 'calendar' | 'workoutDetail' | 'workout';
    /** @deprecated use returnToPlanExerciseContext === 'preview' */
    returnToPlanPreview?: boolean;
    /** Unused when leaving exercise via Back (SearchList); kept for older deep links. */
    planPreviewParams?: any;
    returnToPlanCard?: { weekNumber: number; day: string; workoutId: string };
  };
  WorkoutDetail: { workoutId: string };
  GeneratePlan: { editFromSnapshot?: PlanInputs } | undefined;
  History: undefined;
  PlanPreview: {
    /** Canonical snapshot when user taps Generate; use this downstream. */
    planInputs?: PlanInputs;
    inputs: {
      goal: 'fat loss' | 'strength' | 'endurance' | 'hybrid';
      programType: string;
      programVariationIndex: number;
      trainingDays: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
      startDateISO?: string;
      autoScheduleMode: boolean;
      restDayPreference: string | null;
      allowDoubleSessions: boolean;
      maxDoubleDaysPerWeek: number;
      weeks: number;
      timePerSession: { min: number; max: number };
      primaryLocation: 'gym' | 'home' | null;
      availableEquipment: string[];
      detailedEquipment: string[];
      cardioEquipment: 'treadmill' | 'bike' | 'rower' | 'none' | null;
      experienceLevel: 'beginner' | 'intermediate' | 'advanced';
      strengthSplitPreference: string | null;
      hybridGoalRatio: string | null;
      cardioModalityPreference: string[];
      weekdayMaxMinutes: number;
      weekendMaxMinutes: number;
      perDayTimeCaps: Record<string, number>;
      progressionStyle: 'build' | 'build + deload' | 'maintain' | null;
      deloadEnabled: boolean;
      deloadFrequency: number;
      difficultyRamp: number;
      progressionTarget: string | null;
      maxHardDaysInRow: number;
      maxHardDaysPerWeek: number;
      focusPriority: string | null;
      avoidList: string[];
      sessionCaps: {
        strength: { min: number; max: number };
        cardio: { min: number; max: number };
        recovery: { min: number; max: number };
      };
      currentActivityLevel?: string | null;
      preferredExercises?: string[];
      weekdayWeekendSplit: boolean;
      workoutDetailLevel: 'simple' | 'detailed';
      strengthFormat: 'straight sets' | 'supersets' | 'circuit';
      cardioFormat: 'intervals' | 'steady-state' | 'tempo';
      trainingSplitPreference?: string | null;
      customSplitHint?: string;
      customSplit?: {
        name?: string;
        id?: string;
        templates: { primaries: string[]; secondaries: string[] }[];
        rotationRule: 'repeat_weekly' | 'rotate_forward' | 'auto_balance';
        abs: string;
        cardio: string;
      } | null;
      equipmentAccess?: string[];
      age?: number;
    };
    draftId: string;
    /** When returning from ExerciseDetail, reopen the exact card the user clicked. */
    returnToPlanCard?: { weekNumber: number; day: string; workoutId: string };
  };
};
