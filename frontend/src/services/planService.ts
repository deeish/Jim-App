import { api } from '../api/client';
import type { Workout } from '../types/workout';

export interface PlanSlot {
  weekNumber: number;
  dayOfWeek: string;
  title: string;
  detailLine?: string;
  type: string;
  durationMinutes: number;
  intensity?: string;
  orderInDay?: number;
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
}

export interface ApiPlan {
  id: string;
  name: string;
  userId: string | null;
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
  slots: PlanSlot[];
}

export async function createPlan(body: CreatePlanBody): Promise<ApiPlan> {
  const response = await api.post<ApiPlan>('/plans', body);
  return response.data;
}

export async function updatePlan(id: string, body: CreatePlanBody): Promise<ApiPlan> {
  const response = await api.patch<ApiPlan>(`/plans/${id}`, body);
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
