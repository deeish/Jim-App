import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import NavBar from './src/components/NavBar';
import ProfileScreen from './src/screens/ProfileScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

export type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

const RootStack = createNativeStackNavigator<RootNavigatorParamList>();

function AppContent() {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer>
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <RootStack.Screen name="Main" component={NavBar} />
          <RootStack.Screen name="Profile" component={ProfileScreen} />
        </RootStack.Navigator>
      </NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
