import React, { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import GlassSurface, { glassAvailable } from './GlassSurface';
import {
  crewBadgeHasUnseen,
  refreshCrewBadge,
  subscribeCrewBadge,
} from '../lib/crewBadgeStore';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import CrewScreen from '../screens/CrewScreen';
import PlanCalendarNavigator from '../navigation/PlanCalendarNavigator';
import SearchStackNavigator from '../navigation/SearchStackNavigator';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { PlanCalendarParamList } from '../lib/planCalendarPrototype';
import { haptics } from '../lib/haptics';

import { elevationUp, spacing, text, weight } from '../theme';
export type RootTabParamList = {
  Home: undefined;
  /** The Calendar tab: plan + training hub (Month → Week → Day → Workout). */
  Calendar: NavigatorScreenParams<PlanCalendarParamList> | undefined;
  /** The Crew tab: the accountability group (stories row, crew streak, race).
   *  `joinCode` arrives from a jimapp://crew/CODE deep link and prefills the
   *  join field — joining stays an explicit tap. */
  Crew: { joinCode?: string } | undefined;
  Search: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

/** The Crew icon with the unseen-activity dot (no push infra — an app-open
 *  fingerprint check; opening the tab clears it). */
function useCrewUnseen(): boolean {
  const [unseen, setUnseen] = useState(crewBadgeHasUnseen());
  useEffect(() => subscribeCrewBadge(() => setUnseen(crewBadgeHasUnseen())), []);
  useEffect(() => {
    // On mount AND on every return to the foreground. Without the second, the
    // badge is a COLD-START-only signal: the navigator mounts once, so an app
    // left in the background for a day came back showing yesterday's dot until
    // it was force-quit. With no push, this is the only moment the app gets to
    // notice a crewmate trained, so it is the whole mechanic. Same shape as
    // `useOtaUpdates`.
    void refreshCrewBadge();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshCrewBadge();
    });
    return () => sub.remove();
  }, []);
  return unseen;
}

function CrewTabIcon({
  color,
  focused,
  unseen,
}: {
  color: string;
  focused: boolean;
  unseen: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Ionicons
        name={focused ? 'people' : 'people-outline'}
        size={focused ? 26 : 24}
        color={color}
      />
      {unseen && !focused ? (
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: -3,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.accent,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}

function tabBarButton(testID: string) {
  return ({ onPress, ...props }: BottomTabBarButtonProps) => (
    <Pressable
      {...props}
      testID={testID}
      onPress={(e) => {
        haptics.tap();
        onPress?.(e);
      }}
    />
  );
}

export default function NavBar() {
  const { colors } = useTheme();
  const crewUnseen = useCrewUnseen();
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
        // On iOS 26 the bar's fill is the system glass material. Only supplied
        // when glass is actually available: bottom-tabs forces the bar
        // transparent whenever tabBarBackground is present, so on every other
        // platform this would just paint colors.surface a second time.
        ...(glassAvailable
          ? { tabBarBackground: () => <GlassSurface style={StyleSheet.absoluteFill} /> }
          : null),
        tabBarStyle: {
          // The bar FLOATS over the screens instead of sitting in the layout
          // flow, so list content scrolls underneath it. That moving content is
          // what makes the iOS 26 material read as glass at all — in the layout
          // flow the glass only ever sampled the flat page colour behind the
          // navigator and was pixel-for-pixel indistinguishable from the opaque
          // fallback. Floating on EVERY platform (not just where glass exists)
          // keeps the geometry identical everywhere, so the web fallback
          // verifies the same layout the iPhone renders.
          //
          // The contract this creates: every tab screen pads its scrollable
          // bottom edge (or in-flow footer) by useTabBarInset() — see
          // navigation/useTabBarInset.ts. An unpadded screen hides its last
          // rows behind the bar.
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: glassAvailable ? 'transparent' : colors.surface,
          // Hairline and cast shadow exist only for the opaque fallback, where
          // a white bar needs a drawn boundary. The glass branch drops both:
          // now that content actually passes beneath it, the material carries
          // its own edge — the previous "keep the border in both branches" rule
          // existed precisely because the in-flow bar had nothing to refract.
          borderTopWidth: glassAvailable ? 0 : 1,
          borderTopColor: colors.border,
          paddingTop: spacing.md,
          paddingBottom: Platform.OS === 'ios' ? 20 : 12,
          height: Platform.OS === 'ios' ? 88 : 70,
          ...(glassAvailable ? null : { shadowColor: colors.shadow, ...elevationUp }),
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
        name="Calendar"
        component={PlanCalendarNavigator}
        options={{
          tabBarButton: tabBarButton('e2e-tab-calendar'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Crew"
        component={CrewScreen}
        options={{
          tabBarButton: tabBarButton('e2e-tab-crew'),
          // The dot is the only thing that says there is new crew activity, and
          // it is colour and shape alone — so the tab has to say it too.
          tabBarAccessibilityLabel: crewUnseen ? 'Crew, new activity' : 'Crew',
          tabBarIcon: ({ color, focused }) => (
            <CrewTabIcon color={color} focused={focused} unseen={crewUnseen} />
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
