import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import NavBar from './src/components/NavBar';
import { colors } from './src/theme/colors';

export type RootStackParamList = {
  Home: undefined;
  Plan: undefined;
  Workout: undefined;
  Search: undefined;
  WeeklyWorkout: undefined;
  ExerciseDetail: { exerciseId: string };
  WorkoutDetail: { workoutId: string };
  GeneratePlan: undefined;
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
    };
    draftId: string;
  };
};

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NavigationContainer>
          <NavBar />
          <StatusBar style="light" />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}
