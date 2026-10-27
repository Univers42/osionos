/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysDatabaseViews.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Saved views on a `sys:` source: the viewer's own filters, sorts, visible columns and
 * allowed settings, kept per user by the bridge (`/api/account/self-data/views/<source>`).
 * Only view configuration crosses this file: rows and schema are not in its types or its
 * bodies, and the default view is never saved (the bridge rebuilds it on every load).
 *
 * Caveat: the diff is JSON-based with sorted keys, so a value that JSON cannot tell apart
 * (undefined vs absent) counts as unchanged. A view the bridge refuses (too large, or a
 * key outside its allowlist) is reported by the caller, not retried here.
 */

import type { ViewConfig } from "@notion-db/contract-types";
import type { SysTransport } from "./sysDatabaseTransport";

type Views = Record<string, ViewConfig>;
interface ViewsAnswer { views?: unknown }

const base = (sourceId: string): string => `/api/account/self-data/views/${sourceId}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** JSON with sorted keys: jsonb on the server reorders them. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => isRecord(v)
    ? Object.fromEntries(Object.keys(v).sort((a, b) => (a < b ? -1 : Number(a > b))).map((k) => [k, v[k]]))
    : v);
}

/** What to PUT and what to DELETE to turn `previous` into `next`. The default view and any
 *  built-in view (the app's, not the user's) are skipped. */
export function diffViews(
  next: Views,
  previous: Views | undefined,
  builtIn?: string | readonly string[] | { builtIn?: string | readonly string[]; editable?: string | readonly string[] } | null,
  editable?: string | readonly string[],
): { saved: [string, ViewConfig][]; removed: string[] } {
  const before = previous ?? {};
  let ownedInput: string | readonly string[] | null | undefined = builtIn as string | readonly string[] | null | undefined;
  let editableInput: string | readonly string[] | undefined = editable;
  if (builtIn && typeof builtIn === "object" && !Array.isArray(builtIn)) {
    ownedInput = (builtIn as { builtIn?: string | readonly string[] }).builtIn;
    editableInput = (builtIn as { editable?: string | readonly string[] }).editable ?? editableInput;
  }
  const owned = new Set<string>(ownedInput == null ? [] : (typeof ownedInput === "string" ? [ownedInput] : ownedInput));
  // Editable built-ins are the user's to change: never treat them as owned.
  const editableSet = new Set<string>(editableInput == null ? [] : (typeof editableInput === "string" ? [editableInput] : editableInput));
  for (const id of editableSet) owned.delete(id);
  const saved = Object.entries(next).filter(([id, view]) =>
    !owned.has(id) && (!(id in before) || canonical(before[id]) !== canonical(view)));
  const removed = Object.keys(before).filter((id) => !owned.has(id) && !(id in next));
  return { saved, removed };
}

/** The server map, rebuilt: id and databaseId come from the key and the source, never the body. */
function rebuilt(sourceId: string, answer: unknown): Views {
  const out: Views = Object.create(null);
  const raw = (answer as ViewsAnswer | null)?.views;
  if (!isRecord(raw)) return out;
  for (const id of Object.keys(raw)) {
    const stored = raw[id];
    if (id === "__proto__" || !isRecord(stored)) continue;
    out[id] = { ...stored, id, databaseId: `sys:${sourceId}` } as unknown as ViewConfig;
  }
  return out;
}

/** Empty on a 404 (an older bridge); throws on any other failure. */
export async function fetchSavedViews(sourceId: string, transport: SysTransport): Promise<Views> {
  try {
    return rebuilt(sourceId, await transport.get<unknown>(base(sourceId)));
  } catch (error) {
    if ((error as { status?: number }).status === 404) return Object.create(null) as Views;
    throw error;
  }
}

export async function saveSavedView(sourceId: string, viewId: string, view: ViewConfig, transport: SysTransport): Promise<Views> {
  // Null prototype: a view id or key of `__proto__` stays plain data all the way to JSON.
  const body: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(view)) if (key !== "id" && key !== "databaseId") body[key] = value;
  return rebuilt(sourceId, await transport.put<unknown>(`${base(sourceId)}/${encodeURIComponent(viewId)}`, body));
}

export async function deleteSavedView(sourceId: string, viewId: string, transport: SysTransport): Promise<Views> {
  return rebuilt(sourceId, await transport.delete<unknown>(`${base(sourceId)}/${encodeURIComponent(viewId)}`));
}
