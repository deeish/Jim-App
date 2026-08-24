import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { spacing, text, useTheme, weight } from '../theme';
import { nativeHeaderOptions } from './headerOptions';
import { PlanCalendarScopeBarOverlay } from '../components/PlanCalendarScopeBarHost';
import PlanCalendarMonthScreen from '../screens/PlanCalendarMonthScreen';
import PlanCalendarWeekScreen from '../screens/PlanCalendarWeekScreen';
import PlanCalendarDayScreen from '../screens/PlanCalendarDayScreen';
import PlanCalendarWorkoutScreen from '../screens/PlanCalendarWorkoutScreen';
import PlanCalendarWorkoutCompleteScreen from '../screens/PlanCalendarWorkoutCompleteScreen';
import PlanCalendarExercisePickerScreen from '../screens/PlanCalendarExercisePickerScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ProgressScreen from '../screens/ProgressScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import TemplateDetailScreen from '../screens/TemplateDetailScreen';
import GeneratePlanScreen from '../screens/GeneratePlanScreen';
import PlanPreviewScreen from '../screens/PlanPreviewScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import {
  buzzTap,
  fromIso,
  mondayOf,
  sfPro,
  toIso,
  weekdayIndex,
  WEEKDAYS,
  weekTitle,
  type PlanCalendarParamList,
} from '../lib/planCalendarPrototype';

const Stack = createNativeStackNavigator<PlanCalendarParamList>();

type AnyNav = NativeStackNavigationProp<PlanCalendarParamList>;

/**
 * Labeled header back control — every level names the level it returns to
 * (Workout → "Day", Day → "Week", Week → "Month"). Custom instead of the
 * native back button so the label is identical on iOS, Android and web.
 *
 * ⚠ Device-only sizing: iOS 26 wraps this view in its own Liquid Glass pill,
 * sized by the content. The chevron is deliberately 22 — the same content
 * height as the header's other pills (heart/share icons are 22) — so the back
 * pill matches them instead of rendering as a visibly fatter lozenge (Dylan's
 * build-23 report; the old size-26 chevron was the bloat).
 */
function BackTo({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        buzzTap();
        onPress();
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label.toLowerCase()}`}
      style={backStyles.wrap}
    >
      <Ionicons name="chevron-back" size={22} color={colors.primary} />
      <Text style={[backStyles.label, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const backStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    ...sfPro,
    fontSize: text.headline,
    fontWeight: weight.regular,
    marginLeft: -spacing.xxs,
  },
});

/**
 * Week's back goes UP to the month. The tab LANDS on Week, so at landing time
 * there is no Month beneath it in the stack: pop when Week was genuinely
 * pushed, otherwise reset so Month becomes the root. After that reset the
 * hierarchy is the natural Month → Week → Day → Workout for the rest of the
 * tab's life.
 */
function weekBack(navigation: AnyNav): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.reset({ index: 0, routes: [{ name: 'PlanCalendarMonth' }] });
}

/**
 * Day's back is labeled "Week", so it must actually LAND on the week — but a
 * day can be entered straight from the month grid, where a plain goBack would
 * return to the month. In that case swap this day for its week in place, so
 * back reads Day → Week → Month all the way up.
 */
function dayBack(navigation: AnyNav, dateIso: string): void {
  const state = navigation.getState();
  const prev = state.index > 0 ? state.routes[state.index - 1] : undefined;
  // 'PlanList' is the week view too (the post-apply alias).
  if (prev?.name === 'PlanCalendarWeek' || prev?.name === 'PlanList') {
    navigation.goBack();
    return;
  }
  navigation.replace('PlanCalendarWeek', {
    weekMondayIso: toIso(mondayOf(fromIso(dateIso))),
  });
}

/**
 * PROTOTYPE — the Calendar tab (now standing in for the Plan and Train
 * tabs). Stack: Month grid → Week list (initial route) → Day exercise list →
 * Workout detail, all on sample data from lib/planCalendarPrototype.
 */
export default function PlanCalendarNavigator() {
  const { colors } = useTheme();
  const nativeHeader = nativeHeaderOptions(colors);

  return (
    // The overlay renders AFTER (above) the stack: the frozen Month|Week|Day
    // bar the scope screens register into — see PlanCalendarScopeBarHost.
    <View style={styles.host}>
    <Stack.Navigator
      initialRouteName="PlanCalendarWeek"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="PlanCalendarMonth"
        component={PlanCalendarMonthScreen}
        options={{
          ...nativeHeader,
          title: 'Calendar',
          // Month is only ever mounted via reset (the tab lands on Week, so
          // "up to month" rebuilds the stack root). A reset-mounted large
          // title lands half-expanded on iOS 26: blank title band, content
          // pushed down, no "Calendar" until the first scroll. The compact
          // bar draws correctly from the first frame.
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="PlanCalendarWeek"
        component={PlanCalendarWeekScreen}
        options={({ route, navigation }) => ({
          ...nativeHeader,
          // ⚠ Device-only fix (iOS 26): a large title paired with a custom
          // headerLeft lands half-expanded — blank title band, content pushed
          // down, no title until the first scroll. Same failure the Month
          // screen hit when reset-mounted, same fix (see 0e852c2): the
          // compact bar draws correctly from the first frame. Web's header
          // shim has no large titles, so only an iPhone shows the difference.
          headerLargeTitle: false,
          title: weekTitle(route.params?.weekMondayIso),
          headerLeft: () => <BackTo label="Month" onPress={() => weekBack(navigation)} />,
        })}
      />
      <Stack.Screen
        name="PlanCalendarDay"
        component={PlanCalendarDayScreen}
        options={({ route, navigation }) => ({
          ...nativeHeader,
          // ⚠ Device-only: custom headerLeft + large title — see the Week
          // screen's note above.
          headerLargeTitle: false,
          title: WEEKDAYS[weekdayIndex(fromIso(route.params.dateIso))],
          headerLeft: () => (
            <BackTo label="Week" onPress={() => dayBack(navigation, route.params.dateIso)} />
          ),
        })}
      />
      <Stack.Screen
        name="PlanCalendarWorkout"
        component={PlanCalendarWorkoutScreen}
        options={({ route, navigation }) => ({
          ...nativeHeader,
          // Exercise names run long — the standard title bar fits them better.
          headerLargeTitle: false,
          title: route.params.exerciseName,
          headerLeft: () => <BackTo label="Day" onPress={() => navigation.goBack()} />,
        })}
      />

      {/* The celebration flow behind "Complete Workout" (Moment → Ledger).
          Headerless — it draws its own back pills — and it fades in over the
          day view instead of sliding, per the reveal choreography. A RECAP
          (the day view's "Review session") is ordinary navigation, not a
          reveal, so it pushes normally. */}
      <Stack.Screen
        name="PlanCalendarWorkoutComplete"
        component={PlanCalendarWorkoutCompleteScreen}
        options={({ route }) =>
          route.params?.mode === 'recap'
            ? { animation: 'default' }
            : { animation: 'fade', animationDuration: 240 }
        }
      />

      {/* The library-as-picker sheet (Replace / Add on the day view). An iOS
          card sheet — pull down to cancel; the screen draws its own header.
          Non-scope screen, so the frozen Month|Week|Day bar fades out. */}
      <Stack.Screen
        name="PlanCalendarExercisePicker"
        component={PlanCalendarExercisePickerScreen}
        options={{ presentation: 'modal' }}
      />

      {/* ---- Real plan screens, re-homed from the removed Plan tab ---- */}
      {/* TemplateDetail and PlanPreview reset to 'PlanList' after applying a
          plan; aliasing that name to the calendar week view lands the user on
          "This Week" showing the freshly applied program. */}
      <Stack.Screen
        name="PlanList"
        component={PlanCalendarWeekScreen}
        options={({ route, navigation }) => ({
          ...nativeHeader,
          // ⚠ Device-only: custom headerLeft + large title — see the Week
          // screen's note above.
          headerLargeTitle: false,
          // The week component can retarget this route to the plan's week 1
          // (anchor auto-jump), so the title must track the param.
          title: weekTitle(
            (route.params as { weekMondayIso?: string } | undefined)?.weekMondayIso,
          ),
          headerLeft: () => <BackTo label="Month" onPress={() => weekBack(navigation)} />,
        })}
      />
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
      <Stack.Screen
        name="Templates"
        component={TemplatesScreen}
        options={{ ...nativeHeader, title: 'Templates' }}
      />
      <Stack.Screen
        name="TemplateDetail"
        component={TemplateDetailScreen}
        options={({ route }) => ({
          ...nativeHeader,
          // Program names run long — the standard title bar fits them better.
          headerLargeTitle: false,
          title: route.params.templateName ?? 'Program',
        })}
      />
      {/* GeneratePlan/PlanPreview/WorkoutDetail/ExerciseDetail draw their own
          header rows. ExerciseDetail is the library's guide page — pushed
          plainly here (no cross-tab context params), so its back is a normal
          pop to the workout page. */}
      <Stack.Screen name="GeneratePlan" component={GeneratePlanScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
    </Stack.Navigator>
    <PlanCalendarScopeBarOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
