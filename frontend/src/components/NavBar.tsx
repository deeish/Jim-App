import React from 'react';
import { Platform, Pressable } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import PlanStackNavigator from '../navigation/PlanStackNavigator';
import WorkoutScreen from '../screens/WorkoutScreen';
import SearchStackNavigator from '../navigation/SearchStackNavigator';
import { Ionicons } from '@expo/vector-icons';
import { CalendarIcon } from './TabIcons';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';

import { elevationUp, spacing, text, weight } from '../theme';
export type RootTabParamList = {
  Home: undefined;
  Plan: NavigatorScreenParams<RootStackParamList> | undefined;
  Workout: { workoutId?: string; fromPlan?: boolean } | undefined;
  Search: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function tabBarButton(testID: string) {
  return (props: BottomTabBarButtonProps) => (
    <Pressable {...props} testID={testID} />
  );
}

export default function NavBar() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      // Without this, Android hardware back can jump to the *previous* tab (e.g. Plan/PlanPreview)
      // while the user is on Exercises — tab "history" feels like leaving the exercise list.
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        // Inactive tabs recede into a muted neutral so the active gold reads as
        // the single accent. (Saturated `secondary` green here made the bar look
        // like it had two competing active colors.)
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.md,
          paddingBottom: Platform.OS === 'ios' ? 20 : 12,
          height: Platform.OS === 'ios' ? 88 : 70,
          shadowColor: colors.shadow,
          ...elevationUp,
        },
        tabBarLabelStyle: {
          fontSize: text.footnote,
          fontWeight: weight.semibold,
          marginTop: spacing.xs,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xs,
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{
          tabBarButton: tabBarButton('e2e-tab-home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanStackNavigator}
        options={{
          tabBarButton: tabBarButton('e2e-tab-plan'),
          tabBarIcon: ({ color, focused }) => (
            <CalendarIcon color={color} size={focused ? 26 : 24} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const root = navigation.getState();
            const planRoute = root.routes.find((r: { name: string }) => r.name === 'Plan');
            const focusedChild = planRoute ? getFocusedRouteNameFromRoute(planRoute as never) : undefined;

            // Screens holding in-progress state the user would silently lose: GeneratePlan's
            // unsaved form, PlanPreview's unapplied generated plan. Staying put here is NOT
            // the default — `createNativeStackNavigator` registers its own `tabPress` listener
            // that dispatches `POP_TO_TOP` at the stack whenever its tab is re-tapped while
            // focused, and `POP_TO_TOP` is neither `GO_BACK` nor `POP`, so it walks straight
            // past GeneratePlan's discard-confirmation guard and drops the form with no
            // prompt. Blocking the default is what actually prevents that; the guard alone
            // does not. Only block when this tab is already focused — on a switch *into* Plan
            // from another tab, `preventDefault()` would cancel the tab switch itself, and the
            // built-in pop doesn't run in that case anyway (it checks focus at press time).
            if (focusedChild === 'GeneratePlan' || focusedChild === 'PlanPreview') {
              if (navigation.isFocused()) e.preventDefault();
              return;
            }
            // Plain list/detail views with nothing to lose: reset to the plan list. Redundant
            // with the built-in pop-to-top on a same-tab re-tap, but not on a switch in from
            // another tab, which the built-in deliberately skips.
            if (focusedChild === 'History' || focusedChild === 'WorkoutDetail') {
              e.preventDefault();
              // Carry PlanList's current params across the reset. A nested navigate like this
              // is a non-merge NAVIGATE, and StackRouter *replaces* the target route's params
              // in that case rather than merging — which is exactly how the Search listener
              // used to destroy an in-progress add-mode. PlanList's only param (`openSaved`)
              // has no live writer today, so nothing is actually lost right now; passing them
              // through anyway keeps the next param anyone adds from silently vanishing here.
              // (The Search listener deliberately does NOT do this: dropping a stale add-mode
              // on the way back into that tab is the intended behaviour there, backing up
              // SearchScreen's own blur cleanup.)
              const planListParams = planRoute?.state?.routes?.find(
                (r: { name: string }) => r.name === 'PlanList',
              )?.params;
              navigation.navigate('Plan', { screen: 'PlanList', params: planListParams });
            }
          },
        })}
      />
      <Tab.Screen 
        name="Workout" 
        component={WorkoutScreen}
        options={{
          tabBarButton: tabBarButton('e2e-tab-workout'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'barbell' : 'barbell-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen 
        name="Search" 
        component={SearchStackNavigator}
        options={{
          tabBarLabel: 'Exercises',
          tabBarButton: tabBarButton('e2e-tab-exercises'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'body' : 'body-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const root = navigation.getState();
            const searchRoute = root.routes.find((r: { name: string }) => r.name === 'Search');
            const focusedChild = searchRoute ? getFocusedRouteNameFromRoute(searchRoute as never) : undefined;
            // Search stack had ExerciseDetail (or any non-root screen) on top — e.g. after Plan → exercise
            // row or library → detail, then another tab. Re-tapping "Exercises" must show the library again.
            if (!focusedChild || focusedChild === 'SearchList') return;
            // When this tab is already focused, leave it to native-stack's built-in tabPress
            // handler, which dispatches POP_TO_TOP and therefore keeps SearchList's existing
            // params. Doing it here instead would dispatch NAVIGATE with no params, and a
            // non-merge NAVIGATE *replaces* the target route's params — silently wiping an
            // in-progress `addToPlan`/`addToWorkout` add-mode just because the user checked an
            // exercise's details and tapped the tab icon to come back.
            if (navigation.isFocused()) return;
            // Switching in from another tab: the built-in deliberately skips that case (it
            // checks focus at press time), so this is the one path that still needs handling.
            // Add-mode has already been cleared by SearchScreen's tab-blur cleanup by now, so
            // there are no params left to preserve here.
            e.preventDefault();
            navigation.navigate('Search', { screen: 'SearchList' });
          },
        })}
      />
    </Tab.Navigator>
  );
}
