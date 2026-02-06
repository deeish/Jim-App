/**
 * Navigation param lists. Kept in a separate file to avoid circular dependency
 * that causes "Cannot read properties of null (reading 'useMemo')" on load.
 */

export type RootNavigatorParamList = {
  Main: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Home: undefined;
  Plan: undefined;
  PlanList: undefined;
  Workout: undefined;
  Search: {
    addToPlan?: { day: string; weekIndex: number };
    addToWorkout?: { workoutId: string; workoutName: string; existingExerciseIds?: string[] };
  } | undefined;
  SearchList: {
    addToPlan?: { day: string; weekIndex: number };
    addToWorkout?: { workoutId: string; workoutName: string; existingExerciseIds?: string[] };
  } | undefined;
  WeeklyWorkout: undefined;
  ExerciseDetail: { exerciseId: string };
  WorkoutDetail: { workoutId: string };
  GeneratePlan: undefined;
  History: undefined;
  PlanList: { openSaved?: boolean } | undefined;
  PlanPreview: {
    inputs: {
      goal: 'fat loss' | 'strength' | 'endurance' | 'hybrid';
      programType: string;
      programVariationIndex: number;
      trainingDays: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
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
      currentActivityLevel: string | null;
      preferredExercises: string[];
      weekdayWeekendSplit: boolean;
      workoutDetailLevel: 'simple' | 'detailed';
      strengthFormat: 'straight sets' | 'supersets' | 'circuit';
      cardioFormat: 'intervals' | 'steady-state' | 'tempo';
      trainingSplitPreference?: string | null;
      customSplitHint?: string;
      equipmentAccess?: string[];
      age?: number;
    };
    draftId: string;
  };
};
