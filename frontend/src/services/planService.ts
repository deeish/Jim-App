import { api } from '../api/client';
import type { Workout } from '../types/workout';

export interface PlanSlotExercise {
  exerciseId: string;
  name?: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  orderIndex?: number;
}

export interface PlanSlot {
  weekNumber: number;
  dayOfWeek: string;
  title: string;
  detailLine?: string;
  type: string;
  durationMinutes: number;
  intensity?: string;
  orderInDay?: number;
  /** Sent when applying AI preview so plan slots store exercises without a second LLM pass. */
  exercises?: PlanSlotExercise[];
}

export interface ApiPlanExercise {
  id: string;
  planWorkoutId: string;
  exerciseId: string;
  name: string | null;
  sets: number;
  reps: number;
  weight: number | null;
  notes: string | null;
  orderIndex: number;
}

export interface ApiPlanWorkout {
  id: string;
  workoutPlanId: string;
  weekNumber: number;
  dayOfWeek: string;
  title: string;
  detailLine: string | null;
  type: string;
  durationMinutes: number;
  intensity: string | null;
  orderInDay: number;
  exercises?: ApiPlanExercise[];
}

export interface ApiPlan {
  id: string;
  name: string;
  userId: string | null;
  /** Monday when program week 1 starts (ISO date string from API). */
  weekAnchorMonday?: string | null;
  createdAt: string;
  updatedAt: string;
  planWorkouts: ApiPlanWorkout[];
}

export async function getCurrentPlan(): Promise<ApiPlan | null> {
  const response = await api.get<ApiPlan | null>('/plans/me');
  return response.data;
}

export interface CurrentPlanWithWeekly {
  plan: ApiPlan | null;
  weeklyWorkouts: Workout[];
}

/** Single call for Plan screen: plan + weekly workouts (faster than two requests). */
export async function getCurrentPlanWithWeekly(): Promise<CurrentPlanWithWeekly> {
  const response = await api.get<CurrentPlanWithWeekly>('/plans/me/with-weekly');
  return response.data;
}

export async function getPlanById(id: string): Promise<ApiPlan> {
  const response = await api.get<ApiPlan>(`/plans/${id}`);
  return response.data;
}

export interface CreatePlanBody {
  name?: string;
  /** YYYY-MM-DD — Monday of the week program week 1 is tied to. */
  weekAnchorMonday?: string;
  slots: PlanSlot[];
  /** User goal for workout generation (e.g. strength, hypertrophy, endurance). */
  goal?: string;
  /** Experience level (beginner, intermediate, advanced). */
  experience?: string;
  /** Available equipment for generated workouts (e.g. Barbell, Dumbbell). */
  equipment?: string[];
  /** Limitations to respect (e.g. bad knee, no barbell). */
  limitations?: string[];
  /** Program template id (e.g. ppl, upper-lower-4). */
  programTemplateId?: string;
}

export async function createPlan(body: CreatePlanBody): Promise<ApiPlan> {
  const response = await api.post<ApiPlan>('/plans', body);
  return response.data;
}

export async function updatePlan(id: string, body: CreatePlanBody): Promise<ApiPlan> {
  const response = await api.patch<ApiPlan>(`/plans/${id}`, body);
  return response.data;
}

/** Request body for POST /plans/generate-sessions (LLM-generated session content). */
export interface GenerateSessionsRequest {
  goal?: string;
  location?: 'gym' | 'home';
  detailLevel?: 'simple' | 'detailed';
  avoidConstraints?: string[];
  makeItEasier?: boolean;
  sessions: Array<{
    type: 'strength' | 'cardio' | 'recovery';
    title?: string;
    durationMin: number;
    durationMax: number;
    isHardDay: boolean;
    weekIndex: number;
    weekday: string;
    avoidConstraints?: string[];
  }>;
}

/** One session in the generate-sessions response. */
export interface GenerateSessionResult {
  weekIndex: number;
  weekday: string;
  name: string;
  reasoning?: string;
  warmUp?: string;
  coolDown?: string;
  /** Optional cardio finisher (not in exercises). */
  cardioFinisher?: { suggestion: string };
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    weight?: number;
    notes?: string;
    exerciseId?: string;
  }>;
}

const GENERATE_SESSIONS_TIMEOUT_MS = 90_000;

export async function generateSessions(body: GenerateSessionsRequest): Promise<{ sessions: GenerateSessionResult[] }> {
  const response = await api.post<{ sessions: GenerateSessionResult[] }>('/plans/generate-sessions', body, {
    timeout: GENERATE_SESSIONS_TIMEOUT_MS,
  });
  return response.data;
}

/** Request for POST /plans/generate-single-session (regenerate one session, e.g. to replace an exercise). */
export interface GenerateSingleSessionRequest {
  goal?: string;
  location?: 'gym' | 'home';
  detailLevel?: 'simple' | 'detailed';
  avoidConstraints?: string[];
  type: 'strength' | 'cardio' | 'recovery';
  title?: string;
  durationMin: number;
  durationMax: number;
  isHardDay: boolean;
  weekIndex: number;
  weekday: string;
  excludeExerciseNames?: string[];
}

export async function generateSingleSession(
  body: GenerateSingleSessionRequest
): Promise<GenerateSessionResult> {
  const response = await api.post<GenerateSessionResult>('/plans/generate-single-session', body, {
    timeout: 60000,
  });
  return response.data;
}

/** Append one slot to the signed-in user's current plan (same plan as GET /plans/me). */
export async function addPlanSlotToCurrent(slot: PlanSlot): Promise<ApiPlan> {
  const response = await api.post<ApiPlan>('/plans/me/slots/add', slot);
  return response.data;
}

/** Append one slot to a specific plan by id (prefer {@link addPlanSlotToCurrent} from the app UI). */
export async function addPlanSlot(planId: string, slot: PlanSlot): Promise<ApiPlan> {
  const response = await api.post<ApiPlan>(`/plans/${planId}/slots/add`, slot);
  return response.data;
}

/** Remove a single slot from the plan. Returns the updated plan. */
export async function removePlanSlot(planId: string, slotId: string): Promise<ApiPlan> {
  const url = `/plans/${planId}/slots/remove`;
  const body = { slotId };
  console.warn('[planService] removePlanSlot POST', url, body);
  try {
    const response = await api.post<ApiPlan>(url, body);
    console.warn('[planService] removePlanSlot OK, slots:', response.data?.planWorkouts?.length);
    return response.data;
  } catch (e: any) {
    console.warn('[planService] removePlanSlot FAILED', e?.response?.status, e?.response?.data ?? e?.message);
    throw e;
  }
}
