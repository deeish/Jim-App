import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import WeeklyWorkoutScreen from './src/screens/WeeklyWorkoutScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';

export type RootStackParamList = {
  Home: undefined;
  WeeklyWorkout: undefined;
  WorkoutDetail: { workoutId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#6366f1',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="Home" 
            component={HomeScreen}
            options={{ title: 'Jim App' }}
          />
          <Stack.Screen 
            name="WeeklyWorkout" 
            component={WeeklyWorkoutScreen}
            options={{ title: 'Weekly Workouts' }}
          />
          <Stack.Screen 
            name="WorkoutDetail" 
            component={WorkoutDetailScreen}
            options={{ title: 'Workout Details' }}
          />
        </Stack.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
