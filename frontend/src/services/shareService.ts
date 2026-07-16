import { api } from '../api/client';

export type ShareKind = 'plan' | 'workout';

export interface CreateShareBody {
  kind: ShareKind;
  targetId: string;
  /** Display-name snapshot shown to the recipient ("Shared by ..."). */
  senderName?: string;
}

export interface CreateShareResponse {
  code: string;
  expiresAt: string;
}

export interface SharePreviewExercise {
  name: string | null;
  sets: number;
  reps: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  prescriptionType: string | null;
  weight: number | null;
  notes: string | null;
}

export interface SharePreviewSlot {
  weekNumber: number;
  dayOfWeek: string;
  title: string;
  detailLine: string | null;
  type: string;
  durationMinutes: number;
  intensity: string | null;
  exerciseCount: number;
  exercises: SharePreviewExercise[];
}

export interface SharePreview {
  kind: ShareKind;
  sharedByName: string;
  expiresAt: string;
  isOwnShare: boolean;
  alreadyRedeemed: boolean;
  redeemedPlanId?: string;
  redeemedWorkoutId?: string;
  /** Plan shares only: name of the plan the accept would replace (null = none). */
  recipientActivePlanName?: string | null;
  plan?: {
    name: string;
    weekCount: number;
    slots: SharePreviewSlot[];
  };
  workout?: {
    name: string;
    day: string | null;
    estimatedDuration: number | null;
    focus: string | null;
    exercises: SharePreviewExercise[];
  };
}

export interface AcceptShareResponse {
  kind: ShareKind;
  planId?: string;
  workoutId?: string;
  alreadyRedeemed: boolean;
}

export async function createShare(
  body: CreateShareBody,
): Promise<CreateShareResponse> {
  const response = await api.post<CreateShareResponse>('/shares', body);
  return response.data;
}

export async function getShareByCode(code: string): Promise<SharePreview> {
  const response = await api.get<SharePreview>(`/shares/${code}`);
  return response.data;
}

export async function acceptShare(code: string): Promise<AcceptShareResponse> {
  const response = await api.post<AcceptShareResponse>(
    `/shares/${code}/accept`,
  );
  return response.data;
}
