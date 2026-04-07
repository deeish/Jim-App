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
import { HomeIcon, CalendarIcon, DumbbellIcon, SearchIcon } from './TabIcons';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';

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
        tabBarInactiveTintColor: colors.secondary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 20 : 12,
          height: Platform.OS === 'ios' ? 88 : 70,
          elevation: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{
          tabBarButton: tabBarButton('e2e-tab-home'),
          tabBarIcon: ({ color, focused }) => (
            <HomeIcon color={color} size={focused ? 26 : 24} />
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
      />
      <Tab.Screen 
        name="Workout" 
        component={WorkoutScreen}
        options={{
          tabBarButton: tabBarButton('e2e-tab-workout'),
          tabBarIcon: ({ color, focused }) => (
            <DumbbellIcon color={color} size={focused ? 26 : 24} />
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
            <SearchIcon color={color} size={focused ? 26 : 24} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const root = navigation.getState();
            const searchRoute = root.routes.find((r: { name: string }) => r.name === 'Search');
            const focusedChild = searchRoute ? getFocusedRouteNameFromRoute(searchRoute as never) : undefined;
            // Search stack had ExerciseDetail (or any non-root screen) on top — e.g. after Plan → exercise
            // row or library → detail, then another tab. Re-tapping "Exercises" must show the library again.
            if (focusedChild && focusedChild !== 'SearchList') {
              e.preventDefault();
              navigation.navigate('Search', { screen: 'SearchList' });
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}
