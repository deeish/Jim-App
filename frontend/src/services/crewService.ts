import { api } from '../api/client';

export interface CrewMuscleTag {
  group: string;
  name: string;
}

export type CrewDayState = 'trained' | 'scheduled' | 'missed' | 'rest';

export interface CrewMemberDay {
  dateIso: string;
  state: CrewDayState;
  isToday: boolean;
  title: string | null;
  muscles: CrewMuscleTag[];
  /** The event a pound on this day lands on; null when it isn't poundable
   *  (nobody trained, or it's one of your own days). A day that carried a
   *  record targets the record, so the tile and the row chip agree. */
  poundRef: string | null;
  kudos: number;
  iPounded: boolean;
}

export interface CrewMemberSummary {
  userId: string;
  name: string | null;
  avatarId: string | null;
  isMe: boolean;
  todayState: 'trained' | 'scheduled' | 'rest';
  week: CrewMemberDay[];
  weekStreak: number;
  lastSession: { title: string; dateIso: string } | null;
  race: { done: number; planned: number };
  /** Days trained in the last four weeks. The list's sort key — see
   *  `CrewSummary.legendUserIds` for why it is a count and not a ratio. */
  rolling: number;
  /** Set while the member has paused what they owe the crew; null on duty. */
  restingSinceIso: string | null;
  /** Whole days since resting began — 0 on the day they start. */
  restingDays: number;
  hasPlanThisWeek: boolean;
  kudosWeek: number;
  latestSessionRef: string | null;
  /** Pounds on the latest session alone — the count the row's 💪 shows.
   *  `kudosWeek` is the week-wide total and labels nothing. */
  kudosLatest: number;
  iPoundedLatest: boolean;
}

export interface CrewMoment {
  ref: string;
  /** Null for crew-wide moments (streak milestones). */
  userId: string | null;
  name: string | null;
  avatarId: string | null;
  kind: 'pr' | 'recap' | 'streak';
  dateIso: string;
  kudos: number;
  iPounded: boolean;
  /** pr — the set actually lifted; the record is DETECTED by estimated 1RM
   *  but always announced as real weight x reps. */
  exerciseName?: string;
  weight?: number;
  reps?: number;
  /** recap (userId/name/avatar = the week's winner) */
  winnerDone?: number;
  winnerPlanned?: number;
  crewDone?: number;
  crewPlanned?: number;
  /** streak */
  milestone?: number;
}

export interface CrewSummary {
  crew: { code: string; name: string | null; createdAtIso: string } | null;
  meUserId: string;
  /** Whoever has been in the crew longest: the only member who can remove
   *  someone or mint a new code. Null when you have no crew. */
  leadUserId: string | null;
  streakDays: number;
  members: CrewMemberSummary[];
  /** Everyone tied at the most sessions in the last four weeks — a SHARED
   *  title, empty when the crew has not trained. Deliberately not a ranking:
   *  ordinal standings in a group this small measurably suppress the most
   *  active members, so matching the top is enough to hold it. */
  legendUserIds: string[];
  moments: CrewMoment[];
}

export async function getCrewSummary(
  todayIso: string,
  weekMondayIso: string,
): Promise<CrewSummary> {
  const tz = new Date().getTimezoneOffset();
  const { data } = await api.get<CrewSummary>('/crews/mine/summary', {
    params: { today: todayIso, weekMonday: weekMondayIso, tz },
  });
  return data;
}

export async function createCrew(name: string): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>('/crews', { name });
  return data;
}

export async function joinCrew(code: string): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>('/crews/join', { code });
  return data;
}

export async function leaveCrew(): Promise<void> {
  await api.delete('/crews/mine');
}

export async function renameCrew(name: string): Promise<{ name: string | null }> {
  const { data } = await api.patch<{ name: string | null }>('/crews/mine', {
    name,
  });
  return data;
}

export async function toggleCrewKudos(
  toUserId: string,
  eventRef: string,
): Promise<{ pounded: boolean; count: number }> {
  const { data } = await api.post<{ pounded: boolean; count: number }>(
    '/crews/mine/kudos',
    { toUserId, eventRef },
  );
  return data;
}

/**
 * Pause what you owe the crew, or come back on duty. Always your own row.
 *
 * While resting, your scheduled days stop counting toward the crew's weekly
 * target and can never miss against the crew streak — but anything you do
 * log still counts for the crew.
 */
export async function setCrewResting(
  resting: boolean,
): Promise<{ restingSinceIso: string | null }> {
  const { data } = resting
    ? await api.post<{ restingSinceIso: string | null }>('/crews/mine/rest')
    : await api.delete<{ restingSinceIso: string | null }>('/crews/mine/rest');
  return data;
}

/** Remove a crewmate. Crew lead only; the server enforces it. */
export async function removeCrewMember(targetUserId: string): Promise<void> {
  await api.delete(`/crews/mine/members/${targetUserId}`);
}

/** Mint a new crew code, invalidating the old one. Crew lead only. */
export async function rotateCrewCode(): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>('/crews/mine/code');
  return data;
}
