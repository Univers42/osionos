/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   client.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 22:31:03 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const BASE = (import.meta.env as Record<string, string>)['VITE_API_URL'] ?? 'http://localhost:4000';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  jwt?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Thin fetch wrapper exposing typed GET/POST/PATCH/DELETE helpers. */
export const api = {
  get:    <T>(path: string, jwt?: string)                => request<T>('GET',    path, undefined, jwt),
  post:   <T>(path: string, body: unknown, jwt?: string) => request<T>('POST',   path, body,      jwt),
  patch:  <T>(path: string, body: unknown, jwt?: string) => request<T>('PATCH',  path, body,      jwt),
  delete: <T>(path: string, jwt?: string)                => request<T>('DELETE', path, undefined, jwt),
} as const;
