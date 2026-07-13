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

import { API_BASE, api, getActiveJwt } from '@/shared/api/client';
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
  return getActiveJwt();
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

// jwt defaults to settingsJwt() (the gotrue-path token). A caller whose bridge
// route verifies the `osionos_v1.` app-session token — e.g. connections, which
// hits the same verifyAppSessionToken() gate as object databases — passes
// getActivePageJwt() explicitly; settingsJwt() blanks for a bridge session, so
// the default would silently no-op to localStorage. Default keeps every other
// store byte-identical.
export async function trySettingsGet<T>(path: string, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return api.get<T>(path, jwt);
}

export async function trySettingsPost<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return api.post<T>(path, body, jwt);
}

export async function trySettingsPut<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return api.put<T>(path, body, jwt);
}

export async function trySettingsPatch<T>(path: string, body: unknown, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return api.patch<T>(path, body, jwt);
}

export async function trySettingsDelete<T>(path: string, jwt = settingsJwt()): Promise<T | null> {
  if (!API_BASE || !jwt) return null;
  return api.delete<T>(path, jwt);
}

export async function trySettingsUpload<T>(path: string, formData: FormData): Promise<T | null> {
  const jwt = settingsJwt();
  if (!API_BASE || !jwt) return null;
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`POST ${path} -> ${response.status} ${response.statusText}`);
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
