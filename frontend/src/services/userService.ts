import { api } from '../api/client';

export interface DataExportBundle {
  exportVersion: 1;
  exportedAt: string;
  user: unknown;
}

/**
 * Sync display name / avatar to the server so crewmates can see them.
 * Fire-and-forget by design — swallow failures, the next visit retries.
 */
export async function syncProfileToServer(fields: {
  name?: string;
  avatarId?: string;
}): Promise<void> {
  try {
    await api.patch('/users/me', fields);
  } catch {
    /* offline or transient — the crew screen retries on next focus */
  }
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
