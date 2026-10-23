/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   deviceEngine.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "This device": the engine that runs on the user's own machine.
 *
 * The connection id is `device`, and the engine's coordinates live on THIS
 * device only — in `localStorage`. They never reach our server: the engine
 * URL and its key stay in the browser.
 */

/** The connection id of a device engine. */
export const DEVICE_CONNECTION_ID = "device";

/** Where the engine is remembered. */
export const DEVICE_ENGINE_STORAGE_KEY = "osionos.ai.device.v1";

/** The engine that answers on the user's machine. */
export interface DeviceEngine {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** The slice of `Storage` this module uses — a test can pass its own. */
export interface DeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** The browser's storage, or null when there is none. */
function browserStorage(): DeviceStorage | null {
  try {
    return (globalThis as { localStorage?: DeviceStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored engine, or null when there is none (or it is unreadable). */
export function readDeviceEngine(storage: DeviceStorage | null = browserStorage()): DeviceEngine | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEVICE_ENGINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceEngine> | null;
    const baseUrl = typeof parsed?.baseUrl === "string" ? parsed.baseUrl.trim() : "";
    const model = typeof parsed?.model === "string" ? parsed.model.trim() : "";
    if (!baseUrl || !model) return null;
    const apiKey = typeof parsed?.apiKey === "string" && parsed.apiKey.trim() ? parsed.apiKey.trim() : undefined;
    return { baseUrl, model, ...(apiKey ? { apiKey } : {}) };
  } catch {
    return null;
  }
}

/** Remembers the engine. A storage that refuses is ignored. */
export function writeDeviceEngine(
  engine: DeviceEngine,
  storage: DeviceStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DEVICE_ENGINE_STORAGE_KEY, JSON.stringify(engine));
  } catch {
    // A refused write is not a failure.
  }
}

/** Forgets the engine. */
export function clearDeviceEngine(storage: DeviceStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    if (typeof storage.removeItem === "function") {
      storage.removeItem(DEVICE_ENGINE_STORAGE_KEY);
    } else {
      storage.setItem(DEVICE_ENGINE_STORAGE_KEY, "");
    }
  } catch {
    // A refused clear is not a failure.
  }
}

/** The shape of a validation result. */
export type DeviceUrlCheck =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

/** The sentence shown when the URL is empty. */
export const EMPTY_DEVICE_URL_MESSAGE = "Enter the base URL of your engine, like http://localhost:11434.";

/** The sentence shown when the URL cannot be read as one. */
export const INVALID_DEVICE_URL_MESSAGE = "That is not a URL. Use the http://localhost:11434 form.";

/** The sentence shown when the URL does not point at this machine. */
export const DEVICE_URL_NOT_LOCAL_MESSAGE =
  "This device runs on your machine: the URL must point at localhost, 127.0.0.1 or [::1].";

/**
 * Checks the base URL of the user's own engine.
 *
 * Only `http:` or `https:` to `localhost`, `127.0.0.1` or `[::1]` is
 * accepted — any port, no credentials, no query, no fragment. The trailing
 * `/` and an ending `/v1` are removed from the result.
 */
export function validateDeviceUrl(raw: string): DeviceUrlCheck {
  const value = raw.trim();
  if (!value) return { ok: false, message: EMPTY_DEVICE_URL_MESSAGE };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: INVALID_DEVICE_URL_MESSAGE };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: INVALID_DEVICE_URL_MESSAGE };
  }
  if (url.username || url.password) {
    return { ok: false, message: DEVICE_URL_NOT_LOCAL_MESSAGE };
  }
  if (url.search || url.hash) {
    return { ok: false, message: DEVICE_URL_NOT_LOCAL_MESSAGE };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowed = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!allowed) {
    return { ok: false, message: DEVICE_URL_NOT_LOCAL_MESSAGE };
  }

  let baseUrl = url.origin + url.pathname;
  baseUrl = baseUrl.replace(/\/+$/, "");
  const lower = baseUrl.toLowerCase();
  if (lower.endsWith("/v1")) {
    baseUrl = baseUrl.slice(0, baseUrl.length - 3).replace(/\/+$/, "");
  }
  if (!baseUrl) baseUrl = url.origin;
  return { ok: true, baseUrl };
}
