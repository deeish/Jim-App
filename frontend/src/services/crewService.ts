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
}

export interface CrewMemberSummary {
  userId: string;
  name: string | null;
  avatarId: string | null;
  isMe: boolean;
  todayState: 'trained' | 'scheduled' | 'rest';
  week: CrewMemberDay[];
  weekStreak: number;
  lastSession: { title: string; dateIso: string; performedAtIso: string } | null;
  race: { done: number; planned: number };
  hasPlanThisWeek: boolean;
  kudosWeek: number;
  latestSessionRef: string | null;
  iPoundedLatest: boolean;
}

export interface CrewMoment {
  ref: string;
  userId: string;
  name: string | null;
  avatarId: string | null;
  kind: 'pr';
  exerciseName: string;
  weight: number;
  dateIso: string;
  kudos: number;
  iPounded: boolean;
}

export interface CrewSummary {
  crew: { code: string; createdAtIso: string } | null;
  meUserId: string;
  streakDays: number;
  members: CrewMemberSummary[];
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

export async function createCrew(): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>('/crews');
  return data;
}

export async function joinCrew(code: string): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>('/crews/join', { code });
  return data;
}

export async function leaveCrew(): Promise<void> {
  await api.delete('/crews/mine');
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
