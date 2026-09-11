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
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignInScreen from './src/screens/SignInScreen';
import EmailCodeScreen from './src/screens/EmailCodeScreen';
import PasswordScreen from './src/screens/PasswordScreen';
import SetNewPasswordScreen from './src/screens/SetNewPasswordScreen';
import { ThemeProvider, spacing, text, useTheme } from './src/theme';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { UserPreferencesProvider, useUserPreferences } from './src/contexts/UserPreferencesContext';
import { DevPreviewProvider, useDevPreview } from './src/contexts/DevPreviewContext';
import { wrapWithSentry, sentryNavigationIntegration } from './src/lib/sentry';
import { useOtaUpdates } from './src/lib/useOtaUpdates';
import type {
  AuthStackParamList,
  RootNavigatorParamList,
  RootStackParamList,
} from './src/types/navigation';

export type { RootNavigatorParamList, RootStackParamList } from './src/types/navigation';

const RootStack = createNativeStackNavigator<RootNavigatorParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

/**
 * Minimum time the branded loader stays up, so the brand-mark intro (and the exit
 * cross-fade) are seen on a warm start instead of flashing for a few ms. This is a
 * FLOOR, not a cap: if session restore / preference hydration take longer, the
 * loader stays until they finish — it never truncates real loading.
 */
const LOADING_MIN_DISPLAY_MS = 1500;

function AuthStack({ hasSignedInBefore }: { hasSignedInBefore: boolean }) {
  const { colors } = useTheme();
  return (
    <AuthStackNav.Navigator
      // A fresh install sees the value pitch first; a device that has held a
      // session before (signed out, or a new account after deletion) opens on
      // Sign in. Welcome stays reachable only as the stack root in the first case.
      initialRouteName={hasSignedInBefore ? 'SignIn' : 'Welcome'}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStackNav.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStackNav.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNav.Screen name="EmailCode" component={EmailCodeScreen} />
      <AuthStackNav.Screen name="Password" component={PasswordScreen} />
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
        <Text style={[styles.loadingText, { color: colors.primary }]}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

function AppContent() {
  const { colors, mode } = useTheme();
  const { session, loading, passwordRecoveryMode, hasSignedInBefore } = useAuth();
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
  // `hasSignedInBefore` is one AsyncStorage read; waiting for it keeps the
  // signed-out stack from opening on Welcome and then jumping to Sign in.
  const ready = !loading && hydrated && hasSignedInBefore !== null && minDisplayElapsed;

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
    dark: mode === 'dark',
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
          <AuthStack hasSignedInBefore={hasSignedInBefore === true} />
        )}
      </NavigationContainer>
      )}
      {/* Icon color, not background: dark icons on the light theme, light on Blackout. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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
    gap: spacing.md,
  },
  loadingText: { fontSize: text.callout },
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
