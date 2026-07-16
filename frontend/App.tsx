import React, { useEffect, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

import NavBar from './src/components/NavBar';
import LoadingScreen from './src/components/LoadingScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WeightTrackerScreen from './src/screens/WeightTrackerScreen';
import ShareRedeemScreen from './src/screens/ShareRedeemScreen';
import ShareDeepLinkHandler from './src/components/ShareDeepLinkHandler';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import SetNewPasswordScreen from './src/screens/SetNewPasswordScreen';
import { ThemeProvider, useTheme } from './src/theme';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { UserPreferencesProvider, useUserPreferences } from './src/contexts/UserPreferencesContext';
import { DevPreviewProvider, useDevPreview } from './src/contexts/DevPreviewContext';
import { wrapWithSentry, sentryNavigationIntegration } from './src/lib/sentry';
import { useOtaUpdates } from './src/lib/useOtaUpdates';
import type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

export type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

const RootStack = createNativeStackNavigator<RootNavigatorParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

/**
 * Minimum time the branded loader stays up, so the brand-mark intro (and the exit
 * cross-fade) are seen on a warm start instead of flashing for a few ms. This is a
 * FLOOR, not a cap: if session restore / preference hydration take longer, the
 * loader stays until they finish — it never truncates real loading.
 */
const LOADING_MIN_DISPLAY_MS = 1500;

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

/** DEV-ONLY placeholder shown when the onboarding preview reaches `Main`. */
function DevPreviewDone() {
  const { colors } = useTheme();
  const { setPreviewOnboarding } = useDevPreview();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <Text style={[styles.loadingText, { color: colors.text }]}>
        Onboarding preview complete
      </Text>
      <TouchableOpacity onPress={() => setPreviewOnboarding(false)}>
        <Text style={[styles.loadingText, { color: colors.primary }]}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const { session, loading, passwordRecoveryMode } = useAuth();
  const { hasCompletedOnboarding, hydrated } = useUserPreferences();
  const { previewOnboarding } = useDevPreview();
  const navigationRef = useNavigationContainerRef<RootNavigatorParamList>();

  // Hold the branded loader up for at least LOADING_MIN_DISPLAY_MS from launch.
  const [minDisplayElapsed, setMinDisplayElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinDisplayElapsed(true), LOADING_MIN_DISPLAY_MS);
    return () => clearTimeout(id);
  }, []);

  // App is ready to show once auth + preferences have settled and the loader's
  // minimum display has elapsed.
  const ready = !loading && hydrated && minDisplayElapsed;

  // Keep the branded loader mounted across the hand-off and cross-fade it out over
  // the app, so launch ends on a smooth dissolve instead of a hard cut. The loader
  // is a single persistent overlay (never remounted), so its entrance plays once at
  // launch and then dissolves; the app mounts underneath while it's still covered.
  const [loaderMounted, setLoaderMounted] = useState(true);
  const loaderFade = useSharedValue(1);
  useEffect(() => {
    if (!ready) return;
    loaderFade.value = withTiming(
      0,
      { duration: 480, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(setLoaderMounted)(false);
      },
    );
  }, [ready, loaderFade]);
  const loaderOverlayStyle = useAnimatedStyle(() => ({
    opacity: loaderFade.value,
    // Gentle lift as it dissolves — the splash easing off to reveal the app.
    transform: [{ scale: 1 + (1 - loaderFade.value) * 0.06 }],
  }));

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
      {ready && (
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => {
          sentryNavigationIntegration?.registerNavigationContainer(navigationRef);
        }}
      >
        <ShareDeepLinkHandler navigationRef={navigationRef} />
        {__DEV__ && previewOnboarding ? (
          <RootStack.Navigator
            initialRouteName="Onboarding"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
            <RootStack.Screen name="Main" component={DevPreviewDone} />
          </RootStack.Navigator>
        ) : session ? (
          passwordRecoveryMode ? (
            <SetNewPasswordScreen />
          ) : (
            <RootStack.Navigator
              initialRouteName={hasCompletedOnboarding ? 'Main' : 'Onboarding'}
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
              <RootStack.Screen name="Main" component={NavBar} />
              <RootStack.Screen name="Profile" component={ProfileScreen} />
              <RootStack.Screen name="WeightTracker" component={WeightTrackerScreen} />
              <RootStack.Screen name="ShareRedeem" component={ShareRedeemScreen} />
            </RootStack.Navigator>
          )
        ) : (
          <AuthStack />
        )}
      </NavigationContainer>
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {loaderMounted && (
        <Animated.View
          style={[StyleSheet.absoluteFill, loaderOverlayStyle]}
          pointerEvents={ready ? 'none' : 'auto'}
        >
          <LoadingScreen />
        </Animated.View>
      )}
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
  useOtaUpdates();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <UserPreferencesProvider>
              <DevPreviewProvider>
                <AppContent />
              </DevPreviewProvider>
            </UserPreferencesProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);
