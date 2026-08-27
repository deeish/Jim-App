import React, { useEffect, useReducer, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { sfPro } from '../lib/planCalendarPrototype';
import {
  sessionStartIso,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';

/**
 * How long you have been training today, in the session header.
 *
 * Nothing showed this before: you could log an entire workout without the app
 * ever telling you how long it took, and the duration only appeared after the
 * fact on the celebration screen.
 *
 * ⚠ SELF-CONTAINED ON PURPOSE. It ticks once a second, and the whole point of
 * living in its own component is that the re-render stops here — putting the
 * ticker in the workout screen would redraw the set deck and the whole
 * exercise list every second for one changing number.
 *
 * The clock measures from the day's FIRST LOGGED SET (`sessionStartIso`), the
 * same instant the synced workout log records as its `startedAt`, so the
 * header and History can never disagree about how long a session took. Before
 * the first set there is nothing to measure and it renders nothing.
 */
export default function SessionClock({ dateIso }: { dateIso: string }) {
  const { colors } = useTheme();

  // Re-read the store when a set lands, so the clock appears on the first one.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribePlanCalendar(bump), []);

  const startIso = sessionStartIso(dateIso);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  if (!startIso) return null;
  const startedAt = Date.parse(startIso);
  if (!Number.isFinite(startedAt)) return null;

  // Wall-clock derived, never a tick count — a backgrounded app stops running
  // timers, and a session is exactly when the phone goes in a pocket. See
  // `lib/restTimer` for the same rule and why it matters.
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const label =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;

  return (
    <Text
      style={[styles.clock, { color: colors.textSecondary }]}
      accessibilityLabel={`Training for ${hours > 0 ? `${hours} hours ` : ''}${minutes} minutes`}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  clock: {
    ...sfPro,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
