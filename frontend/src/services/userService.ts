import { api } from '../api/client';

export interface DataExportBundle {
  exportVersion: 1;
  exportedAt: string;
  user: unknown;
}

export async function exportMyData(): Promise<DataExportBundle> {
  const { data } = await api.get<DataExportBundle>('/users/me/export');
  return data;
}

export async function deleteMyAccount(): Promise<{
  supabaseAuthDeleted: boolean;
}> {
  const { data } = await api.delete<{ supabaseAuthDeleted: boolean }>(
    '/users/me',
  );
  return {
    supabaseAuthDeleted: data?.supabaseAuthDeleted ?? false,
  };
}
