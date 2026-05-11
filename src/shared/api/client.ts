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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  jwt?: string,
): Promise<T> {
  if (!API_BASE) {
    throw new Error("VITE_API_URL is not configured.");
  }

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
}

/** Thin fetch wrapper exposing typed GET/POST/PATCH/DELETE helpers. */
export const api = {
  get:    <T>(path: string, jwt?: string)                => request<T>('GET',    path, undefined, jwt),
  post:   <T>(path: string, body: unknown, jwt?: string) => request<T>('POST',   path, body,      jwt),
  put:    <T>(path: string, body: unknown, jwt?: string) => request<T>('PUT',    path, body,      jwt),
  patch:  <T>(path: string, body: unknown, jwt?: string) => request<T>('PATCH',  path, body,      jwt),
  delete: <T>(path: string, jwt?: string)                => request<T>('DELETE', path, undefined, jwt),
} as const;
