import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {}

// Who is using the app, sent with every request so the server can check what they may see
// (until staff sign-in replaces it with a session).
let actingUserId: number | null = null;
export const setActingUser = (id: number | null) => void (actingUserId = id);

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) headers['content-type'] = 'application/json';
  if (actingUserId != null) headers['x-user-id'] = String(actingUserId);
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = (path: string) => api<{ ok: true }>(path, { method: 'DELETE' });

/** Fetch JSON for a path; refetches when the path changes. `null` skips the request. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    return api<T>(path)
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, reload };
}
