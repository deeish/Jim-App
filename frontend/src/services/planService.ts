import { api } from '../api/client';

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
  const response = await api.get<ApiPlan | null>('/plans/current');
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
