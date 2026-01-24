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
  ExerciseDetail: { exerciseId: string };
  WorkoutDetail: { workoutId: string };
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
