import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

import NavBar from './src/components/NavBar';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import SetNewPasswordScreen from './src/screens/SetNewPasswordScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { UserPreferencesProvider } from './src/contexts/UserPreferencesContext';
import { wrapWithSentry } from './src/lib/sentry';
import type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

export type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

const RootStack = createNativeStackNavigator<RootNavigatorParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

function AuthStack() {
  const { colors } = useTheme();
  return (
    <AuthStackNav.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
      <AuthStackNav.Screen name="Signup" component={SignupScreen} />
      <AuthStackNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStackNav.Navigator>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const { session, loading, passwordRecoveryMode } = useAuth();

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading…
        </Text>
      </View>
    );
  }

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer theme={navTheme}>
        {session ? (
          passwordRecoveryMode ? (
            <SetNewPasswordScreen />
          ) : (
            <RootStack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <RootStack.Screen name="Main" component={NavBar} />
              <RootStack.Screen name="Profile" component={ProfileScreen} />
            </RootStack.Navigator>
          )
        ) : (
          <AuthStack />
        )}
      </NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 16 },
});

function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <UserPreferencesProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </UserPreferencesProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default wrapWithSentry(App);
