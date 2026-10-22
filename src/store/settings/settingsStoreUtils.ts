/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsStoreUtils.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, api, ApiError, getActivePageJwt } from '@/shared/api/client';
import { useToastStore } from '@/shared/ui';

export const SETTINGS_WRITE_DEBOUNCE_MS = 400;

type Timer = ReturnType<typeof setTimeout>;
const writeTimers = new Map<string, Timer>();

export function nowIso(): string {
  return new Date().toISOString();
}

// zustand v5's useStore wraps a NON-memoizing useSyncExternalStore, so a
// selector that returns a fresh object every call is an unstable snapshot →
// React's "getSnapshot should be cached" infinite render loop → the panel
// blanks. The `getData(id) => data[id] ?? defaultX(id)` pattern hits this the
// moment a workspace has no persisted row (defaultX() mints a new object with a
// fresh nowIso() each call). Caching the default per key gives getData a stable
// reference so the loop never starts. One home for the fix; every settings
// store shares it. (ponytail: unbounded Map, but bounded in practice by
// stores × workspaces — a handful of entries; add eviction only if that ever
// grows, which it won't.)
const DEFAULTS_CACHE = new Map<string, unknown>();

export function stableDefault<T>(key: string, make: () => T): T {
  let cached = DEFAULTS_CACHE.get(key) as T | undefined;
  if (cached === undefined) {
    cached = make();
    DEFAULTS_CACHE.set(key, cached);
  }
  return cached;
}

export function createLocalId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function settingsJwt(): string | null {
  return getActivePageJwt();
}

/**
 * What a failed settings call means:
 * - `unavailable`: this server does not serve the route yet (404, 501, or a 503
 *   whose code names the feature unavailable or off) — the store keeps working
 *   locally, with no error toast.
 * - `sudo_required`: the server wants a fresh sign-in; the shared fetch path
 *   raises the prompt, so the caller says nothing extra.
 * - `failed`: everything else — the caller shows the message.
 *
 * Pure, so it can be unit-tested without importing the env-bound api client.
 *
 * Caveat: a genuine 404 on a route that DOES exist (a mistyped path) is also
 * read as `unavailable`; acceptance 2 proves the classification, and P1-2's e2e
 * proves the routes.
 */
export function classifySettingsError(status: number, code?: string | null): 'unavailable' | 'sudo_required' | 'failed' {
  if (status === 404 || status === 501) return 'unavailable';
  if (status === 503 && code && (code.endsWith('_unavailable') || code.endsWith('_off'))) return 'unavailable';
  if (status === 403 && code === 'sudo_required') return 'sudo_required';
  return 'failed';
}

/** Whether an error means "this account route is not served by this bridge yet". */
export function isSettingsEndpointUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return classifySettingsError(error.status, error.code) === 'unavailable';
}

export function settingsApiAvailable(): boolean {
  return Boolean(API_BASE && settingsJwt());
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Settings request failed.';
}

export function pushSettingsError(title: string, error: unknown) {
  useToastStore.getState().push({
    kind: 'error',
    title,
    description: errorMessage(error),
  });
}

const UNAVAILABLE_LOGGED = new Set<string>();

function logUnavailableOnce(path: string): void {
  if (UNAVAILABLE_LOGGED.has(path)) return;
  UNAVAILABLE_LOGGED.add(path);
  console.info(`[settings] ${path} is not available on this server yet; staying local.`);
}

async function withSettingsFallback<T>(path: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isSettingsEndpointUnavailable(error)) {
      logUnavailableOnce(path);
      return null;
    }
    throw error;
  }
}

export async function trySettingsGet<T>(path: string, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return withSettingsFallback(path, () => api.get<T>(path, jwt));
}

export async function trySettingsPost<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return withSettingsFallback(path, () => api.post<T>(path, body, jwt));
}

export async function trySettingsPut<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return withSettingsFallback(path, () => api.put<T>(path, body, jwt));
}

export async function trySettingsPatch<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return withSettingsFallback(path, () => api.patch<T>(path, body, jwt));
}

export async function trySettingsDelete<T>(path: string, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return withSettingsFallback(path, () => api.delete<T>(path, jwt));
}

export async function trySettingsUpload<T>(path: string, formData: FormData): Promise<T | null> {
  const jwt = settingsJwt();
  if (!API_BASE || !jwt) return null;
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  if (!response.ok) {
    // The body carries the server's stable error code, so the same
    // "not offered here" classification applies to an upload.
    const body = (await response.clone().json().catch(() => null)) as { code?: unknown; error?: string; message?: string } | null;
    const code = typeof body?.code === 'string' ? body.code : 'API_ERROR';
    const error = new ApiError(
      body?.error ?? body?.message ?? `POST ${path} -> ${response.status} ${response.statusText}`,
      response.status,
      code,
    );
    if (isSettingsEndpointUnavailable(error)) {
      logUnavailableOnce(path);
      return null;
    }
    throw error;
  }
  return response.json() as Promise<T>;
}

export function scheduleSettingsWrite(key: string, write: () => Promise<void>) {
  const existing = writeTimers.get(key);
  if (existing) clearTimeout(existing);
  writeTimers.set(key, setTimeout(() => {
    writeTimers.delete(key);
    void write();
  }, SETTINGS_WRITE_DEBOUNCE_MS));
}

export function cancelSettingsWrite(key: string) {
  const existing = writeTimers.get(key);
  if (!existing) return;
  clearTimeout(existing);
  writeTimers.delete(key);
}

export function upsertById<T extends { _id: string }>(items: T[], item: T): T[] {
  return items.some((current) => current._id === item._id)
    ? items.map((current) => current._id === item._id ? item : current)
    : [item, ...items];
}

export function removeById<T extends { _id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item._id !== id);
}

export function mergeDefined<T extends Record<string, unknown>>(current: T, patch: Partial<T>): T {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key as keyof T] = value as T[keyof T];
  }
  return next;
}
