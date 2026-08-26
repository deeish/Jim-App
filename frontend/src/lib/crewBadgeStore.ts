import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCrewSummary, type CrewSummary } from '../services/crewService';
import { computeCrewSignature } from './crewSignature';

/**
 * The Crew tab's badge dot: lights when crew activity happened since the tab
 * was last opened. No push infrastructure — an app-open fetch compares a
 * stored activity fingerprint against a fresh one; opening the tab stores it.
 */

const SEEN_KEY = 'jim_crew_seen_v1';

let hasUnseen = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === hasUnseen) return;
  hasUnseen = next;
  for (const fn of listeners) fn();
}

export function crewBadgeHasUnseen(): boolean {
  return hasUnseen;
}

export function subscribeCrewBadge(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function localTodayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function localWeekMondayIso(): string {
  const d = new Date();
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - back);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** App-open check (NavBar mounts it). Failures leave the badge as it was. */
export async function refreshCrewBadge(): Promise<void> {
  try {
    const summary = await getCrewSummary(localTodayIso(), localWeekMondayIso());
    const fresh = computeCrewSignature(summary);
    if (!fresh) {
      set(false);
      return;
    }
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    // First-ever fingerprint: store it silently rather than badging a user
    // who has simply never opened the tab on this device.
    if (seen === null) {
      await AsyncStorage.setItem(SEEN_KEY, fresh);
      set(false);
      return;
    }
    set(seen !== fresh);
  } catch {
    /* offline — keep whatever state we had */
  }
}

/** The Crew tab calls this with the summary it just rendered. */
export async function markCrewSeen(summary: CrewSummary): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, computeCrewSignature(summary));
  } catch {
    /* storage failure only risks a stale badge */
  }
  set(false);
}
