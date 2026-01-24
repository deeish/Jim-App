import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import SearchScreen from '../screens/SearchScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function SearchStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
    </Stack.Navigator>
  );
}
