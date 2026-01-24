import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import PlanScreen from '../screens/PlanScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import SearchStackNavigator from '../navigation/SearchStackNavigator';
import { HomeIcon, CalendarIcon, DumbbellIcon, SearchIcon } from './TabIcons';
import { colors } from '../theme/colors';

export type RootTabParamList = {
  Home: undefined;
  Plan: undefined;
  Workout: undefined;
  Search: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function NavBar() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
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
          tabBarIcon: ({ color, focused }) => (
            <HomeIcon color={color} size={focused ? 26 : 24} />
          ),
        }}
      />
      <Tab.Screen 
        name="Plan" 
        component={PlanScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <CalendarIcon color={color} size={focused ? 26 : 24} />
          ),
        }}
      />
      <Tab.Screen 
        name="Workout" 
        component={WorkoutScreen}
        options={{
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
          tabBarIcon: ({ color, focused }) => (
            <SearchIcon color={color} size={focused ? 26 : 24} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
