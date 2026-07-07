import { api } from '../api/client';
import { formatLocalYmd } from '../lib/planCalendar';

/** Weights are always stored/sent in pounds (see lib/weightDisplay.ts). */
export interface BodyWeightEntry {
  id: string;
  weightLb: number;
  loggedAt: string;
  /** Local calendar day (YYYY-MM-DD) the entry belongs to; one per day. */
  dayKey: string;
  note: string | null;
  createdAt: string;
}

export interface CreateBodyWeightEntryInput {
  weightLb: number;
  /** ISO timestamp; backend defaults to now when omitted. */
  loggedAt?: string;
  /** Local calendar day (YYYY-MM-DD); the backend replaces same-day entries. */
  dayKey?: string;
  note?: string;
}

export async function listWeighIns(limit?: number): Promise<BodyWeightEntry[]> {
  const { data } = await api.get<BodyWeightEntry[]>('/me/weight', {
    params: limit ? { limit } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

export async function logWeighIn(
  input: CreateBodyWeightEntryInput,
): Promise<BodyWeightEntry> {
  // Stamp the device's local instant AND calendar day: "one entry per day"
  // must follow the user's clock, or an evening log lands on tomorrow's UTC
  // day and stops replacing today's entry.
  const now = new Date();
  const body: CreateBodyWeightEntryInput = {
    loggedAt: now.toISOString(),
    dayKey: formatLocalYmd(now),
    ...input,
  };
  const { data } = await api.post<BodyWeightEntry>('/me/weight', body);
  return data;
}

export async function deleteWeighIn(id: string): Promise<void> {
  await api.delete(`/me/weight/${encodeURIComponent(id)}`);
}
