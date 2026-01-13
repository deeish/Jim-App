import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Platform } from 'react-native';

import PlanScreen from './src/screens/PlanScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import { CalendarIcon, DumbbellIcon } from './src/components/TabIcons';
import { colors } from './src/theme/colors';

export type RootTabParamList = {
  Plan: undefined;
  Workout: undefined;
};

export type RootStackParamList = RootTabParamList;

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NavigationContainer>
          <Tab.Navigator
            initialRouteName="Plan"
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
          </Tab.Navigator>
          <StatusBar style="light" />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}
