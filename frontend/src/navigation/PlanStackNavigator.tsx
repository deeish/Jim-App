import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import PlanScreen from '../screens/PlanScreen';
import GeneratePlanScreen from '../screens/GeneratePlanScreen';
import PlanPreviewScreen from '../screens/PlanPreviewScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ProgressScreen from '../screens/ProgressScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';
import { useTheme } from '../theme';
import { nativeHeaderOptions } from './headerOptions';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * History and Progress use the real native header (large title, native back,
 * scroll-edge treatment). The other three keep hand-rolled headers for now:
 * PlanList carries a share control and a plan switcher, GeneratePlan a step
 * indicator, and PlanPreview a pair of apply/discard actions — each needs its
 * header row rebuilt around `headerRight` before it can move across.
 */
export default function PlanStackNavigator() {
  const { colors } = useTheme();
  const nativeHeader = nativeHeaderOptions(colors);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="PlanList" component={PlanScreen} />
      <Stack.Screen
        name="History"
        component={CalendarScreen}
        options={{ ...nativeHeader, title: 'History' }}
      />
      <Stack.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ ...nativeHeader, title: 'Progress' }}
      />
      <Stack.Screen name="GeneratePlan" component={GeneratePlanScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
    </Stack.Navigator>
  );
}
