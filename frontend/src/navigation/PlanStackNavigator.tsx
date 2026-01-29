import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import PlanScreen from '../screens/PlanScreen';
import GeneratePlanScreen from '../screens/GeneratePlanScreen';
import PlanPreviewScreen from '../screens/PlanPreviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function PlanStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Plan" component={PlanScreen} />
      <Stack.Screen name="GeneratePlan" component={GeneratePlanScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
    </Stack.Navigator>
  );
}
