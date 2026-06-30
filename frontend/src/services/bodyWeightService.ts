import { api } from '../api/client';

/** Weights are always stored/sent in pounds (see lib/weightDisplay.ts). */
export interface BodyWeightEntry {
  id: string;
  weightLb: number;
  loggedAt: string;
  note: string | null;
  createdAt: string;
}

export interface CreateBodyWeightEntryInput {
  weightLb: number;
  /** ISO timestamp; backend defaults to now when omitted. */
  loggedAt?: string;
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
  // Stamp the device's local instant so the recorded day matches when the user
  // logged it, rather than relying on server time.
  const body: CreateBodyWeightEntryInput = {
    loggedAt: new Date().toISOString(),
    ...input,
  };
  const { data } = await api.post<BodyWeightEntry>('/me/weight', body);
  return data;
}

export async function deleteWeighIn(id: string): Promise<void> {
  await api.delete(`/me/weight/${encodeURIComponent(id)}`);
}
