/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   client.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 05:03:33 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export const API_BASE = ((import.meta.env as Record<string, string>)['VITE_API_URL'] ?? '').trim();

export interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'API_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getActiveJwt(): string | null {
  try {
    const store = (globalThis as unknown as Record<string, unknown>).__playgroundUserStore as
      | { getState: () => { activeJwt: () => string | null } }
      | undefined;
    return store?.getState().activeJwt() || null;
  } catch {
    return null;
  }
}

export function getActivePageJwt(): string | null {
  try {
    const store = (globalThis as unknown as Record<string, unknown>).__playgroundUserStore as
      | { getState: () => { activePageJwt?: () => string | null; activeJwt: () => string | null } }
      | undefined;
    const state = store?.getState();
    return state?.activePageJwt?.() || state?.activeJwt() || null;
  } catch {
    return null;
  }
}

// ── request hygiene ────────────────────────────────────────────────────────
// Bound how many requests hit the bridge/BaaS at once and collapse identical
// in-flight GETs. A view that needs many pages then drains politely instead of
// firing hundreds of parallel calls (which the BaaS rate-limits → 429/502).
const MAX_CONCURRENT_REQUESTS = 6;
let activeRequests = 0;
const slotWaiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => slotWaiters.push(resolve));
}

function releaseSlot(): void {
  const next = slotWaiters.shift();
  if (next) next(); // hand the held slot straight to the next waiter (count unchanged)
  else activeRequests -= 1;
}

/** Identical GETs that are still in flight share one network call + result. */
const inflightGets = new Map<string, Promise<unknown>>();

async function executeRequest<T>(method: string, path: string, body?: unknown, jwt?: string): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_URL is not configured.");
  await acquireSlot();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null) as ApiErrorBody | null;
      throw new ApiError(
        errorBody?.error ?? errorBody?.message ?? `${method} ${path} → ${res.status} ${res.statusText}`,
        res.status,
        errorBody?.code ?? 'API_ERROR',
        errorBody?.details,
      );
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } finally {
    releaseSlot();
  }
}

async function request<T>(method: string, path: string, body?: unknown, jwt?: string): Promise<T> {
  if (method !== 'GET') return executeRequest<T>(method, path, body, jwt);
  const key = `GET ${path}`;
  const shared = inflightGets.get(key);
  if (shared) return shared as Promise<T>;
  const pending = executeRequest<T>(method, path, body, jwt).finally(() => inflightGets.delete(key));
  inflightGets.set(key, pending);
  return pending;
}

/** Thin fetch wrapper exposing typed GET/POST/PATCH/DELETE helpers. */
export const api = {
  get:    <T>(path: string, jwt?: string)                => request<T>('GET',    path, undefined, jwt),
  post:   <T>(path: string, body: unknown, jwt?: string) => request<T>('POST',   path, body,      jwt),
  put:    <T>(path: string, body: unknown, jwt?: string) => request<T>('PUT',    path, body,      jwt),
  patch:  <T>(path: string, body: unknown, jwt?: string) => request<T>('PATCH',  path, body,      jwt),
  delete: <T>(path: string, jwt?: string)                => request<T>('DELETE', path, undefined, jwt),
} as const;
