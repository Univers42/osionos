/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   featureFlags.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type FeatureFlagName =
  | "osio.canvas.v2"
  | "osio.profile.template"
  | "osio.collab.shared"
  | "osio.blockselect"
  | "osio.automations"
  | "osio.db.server";

export function isFeatureFlagEnabled(name: FeatureFlagName, fallback = false): boolean {
  const urlValue = readUrlFlag(name);
  if (urlValue !== null) return flagValueToBoolean(urlValue, fallback);
  const storedValue = readStoredFlag(name);
  if (storedValue !== null) return flagValueToBoolean(storedValue, fallback);
  const envValue = import.meta.env[envKeyForFlag(name)];
  if (typeof envValue === "string") return flagValueToBoolean(envValue, fallback);
  return fallback;
}

/** Canvas V2 (free-frame builder) is the default canvas. The legacy V1 grid
 *  stays reachable as a fallback via any override (`?osio.canvas.v2=0`, the
 *  `osio.canvas.v2` localStorage key, or `VITE_OSIO_CANVAS_V2=0`). The stored
 *  document format is identical (`migration.ts` round-trips losslessly), so a
 *  page authored under either engine opens correctly under the other. */
export function isCanvasV2Enabled(): boolean {
  return isFeatureFlagEnabled("osio.canvas.v2", true);
}

/** Render the admin-authored, data-bound profile template (falls back to the
 *  built-in ProfileView when off or when no template page exists). */
export function isProfileTemplateEnabled(): boolean {
  return isFeatureFlagEnabled("osio.profile.template", false);
}

/** Shared-space live co-presence (AOC). Default OFF: the realtime channel is
 *  membership-gated at the bridge, but server-side namespace isolation is not
 *  fully enforced until the gateway `REALTIME_NAMESPACE_FALLBACK=deny` cutover
 *  (which first needs chat/feed/live-DB migrated to scoped tokens). Until then
 *  presence stays opt-in via `?osio.collab.shared=1` for dev/demo only. */
export function isSharedCollabEnabled(): boolean {
  return isFeatureFlagEnabled("osio.collab.shared", false);
}

/** Full-page marquee (rubber-band) multi-select + the right-click selection
 *  menu (cut/copy/paste/duplicate/delete). Default OFF: promotes block
 *  selection into a store and re-anchors the marquee to the whole page. Enable
 *  Default ON; disable via `?osio.blockselect=0`, the `osio.blockselect`
 *  localStorage key, or `VITE_OSIO_BLOCKSELECT=0`. */
export function isBlockSelectEnabled(): boolean {
  return isFeatureFlagEnabled("osio.blockselect", true);
}

/** Data-driven keyboard automations (the VSCode-style shortcut manager: each
 *  shortcut is a keyboard-trigger → run-command automation record). Default
 *  OFF: a document-level dispatcher owns the bound chords only when ON, so
 *  the legacy keybindings route through the dispatcher's commands. Default ON;
 *  disable via `?osio.automations=0`, the `osio.automations` localStorage key,
 *  or `VITE_OSIO_AUTOMATIONS=0`. */
export function isAutomationsEnabled(): boolean {
  return isFeatureFlagEnabled("osio.automations", true);
}

/** Server-side persistence for user-created object databases (the inline
 *  `/database` blocks, `source=adapter`). Default ON: a database's schema,
 *  views AND records live in Postgres (owner-isolated, via the bridge) instead
 *  of browser localStorage alone — so they survive a cache clear and follow the
 *  account across machines. localStorage stays a write-through offline cache
 *  (no data loss). Disable via `?osio.db.server=0`, the `osio.db.server`
 *  localStorage key, or `VITE_OSIO_DB_SERVER=0` (the offline/Playwright build
 *  has no bridge URL, so sync no-ops there regardless). */
export function isObjectDatabaseServerSyncEnabled(): boolean {
  return isFeatureFlagEnabled("osio.db.server", true);
}

function readUrlFlag(name: FeatureFlagName): string | null {
  if (globalThis.window === undefined) return null;
  const searchParams = new URLSearchParams(globalThis.window.location.search);
  const hashParams = new URLSearchParams(globalThis.window.location.hash.replace(/^#/, ""));
  return searchParams.get(name) ?? hashParams.get(name) ?? searchParams.get(envKeyForFlag(name)) ?? hashParams.get(envKeyForFlag(name));
}

function readStoredFlag(name: FeatureFlagName): string | null {
  if (globalThis.window === undefined) return null;
  try {
    return globalThis.window.localStorage.getItem(name) ?? globalThis.window.localStorage.getItem(envKeyForFlag(name));
  } catch {
    return null;
  }
}

function envKeyForFlag(name: FeatureFlagName): string {
  return `VITE_${name.toUpperCase().replaceAll(".", "_")}`;
}

function flagValueToBoolean(value: string, fallback: boolean): boolean {
  if (["1", "true", "on", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "off", "no"].includes(value.toLowerCase())) return false;
  return fallback;
}
