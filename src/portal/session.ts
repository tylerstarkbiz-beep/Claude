// The portal's sign-in session and API calls. Separate from the office app's API helper so a
// client's requests always carry their portal session and nothing else.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';

const KEY = 'portal.session';
let memory: string | null = null;

export function getSession(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setSession(token: string | null) {
  memory = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the session lasts until the tab closes.
  }
}

export class SignedOut extends Error {}

export async function papi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = getSession();
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setSession(null);
    throw new SignedOut(data.error ?? 'Please sign in again');
  }
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function usePortal<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    return papi<T>(path)
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e));
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, reload };
}
