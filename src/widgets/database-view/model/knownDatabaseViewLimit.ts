/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseViewLimit.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState } from "@notion-db/object-database";

export interface KnownDatabaseAdapterOptions {
  /** Compact fallback for an inline embed — fills a view's `loadLimit` ONLY when
   *  the user hasn't set a per-view Limit. Never clamps an explicit choice
   *  (the collision that made the Limit setting appear not to persist). */
  defaultLoadLimit?: number;
  /** Explicit per-embed hard cap (block `recordLimit`) — clamps every view. */
  recordCap?: number;
}

type View = NotionState["views"][string];
interface ViewLimits { fill?: number; cap?: number }

const PAGED_VIEW_TYPES = new Set(["table", "list", "timeline"]);

function resolveLimits(options: KnownDatabaseAdapterOptions): ViewLimits {
  const { defaultLoadLimit, recordCap } = options;
  return {
    fill: defaultLoadLimit && defaultLoadLimit > 0 ? Math.max(1, Math.round(defaultLoadLimit)) : undefined,
    cap: recordCap && recordCap > 0 ? Math.max(1, Math.round(recordCap)) : undefined,
  };
}

// Respect an explicit per-view Limit (incl. 0 = "All"); only fall back to the compact
// inline default when the user hasn't chosen one. This is the fix for the Limit that
// "didn't persist": the default no longer clamps it. An explicit per-embed record cap
// still clamps (0 = "All" is never capped).
function projectedLimit(stored: unknown, limits: ViewLimits): number | undefined {
  const current = Number(stored);
  let next = Number.isFinite(current) ? current : limits.fill;
  if (limits.cap !== undefined && next !== undefined && next !== 0) next = Math.min(next, limits.cap);
  return next;
}

function projectView(view: View, limits: ViewLimits): View {
  if (!PAGED_VIEW_TYPES.has(view.type)) return view;
  const next = projectedLimit(view.settings?.loadLimit, limits);
  if (next === undefined) return view;
  return { ...view, settings: { ...view.settings, loadLimit: next } };
}

/** The state an embed renders: every paged view carries the embed's Limit. */
export function applyAdapterOptions(state: NotionState, options: KnownDatabaseAdapterOptions): NotionState {
  const limits = resolveLimits(options);
  if (limits.fill === undefined && limits.cap === undefined) return state;
  return {
    ...state,
    views: Object.fromEntries(Object.entries(state.views).map(([viewId, view]) => [viewId, projectView(view, limits)])),
  };
}

type Settings = NonNullable<View["settings"]>;

const fieldsOf = (value: object | undefined) => (value ?? {}) as Record<string, unknown>;

// The projection spreads the stored view, so an untouched one differs from it only by
// new objects holding the same values: identity of every field (and of every field of
// `nested`, one level down) decides it.
function sameFields(left: object | undefined, right: object | undefined, nested?: string): boolean {
  const a = fieldsOf(left);
  const b = fieldsOf(right);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const same = key === nested ? sameFields(a[key] as object | undefined, b[key] as object | undefined) : a[key] === b[key];
    if (!same) return false;
  }
  return true;
}

function unprojectView(view: View, stored: View | undefined, limits: ViewLimits): View {
  if (!PAGED_VIEW_TYPES.has(view.type)) return view;
  const storedLimit = stored?.settings?.loadLimit;
  const projected = projectedLimit(storedLimit, limits);
  if (projected === undefined || view.settings?.loadLimit !== projected) return view;
  const settings: Settings = { ...view.settings };
  if (storedLimit === undefined) delete settings.loadLimit;
  else settings.loadLimit = storedLimit;
  const restored = { ...view, settings };
  return stored && sameFields(restored, stored, "settings") ? stored : restored;
}

/** The views an embed writes back, with its own projection taken out: a Limit the
 *  embed showed but the user did not pick is restored to the stored one, and a view
 *  whose only difference was that Limit is the stored object itself. Only the views
 *  that changed since `previous` are looked at; the rest pass through untouched.
 *  Caveat: a Limit the user picks that equals what the embed shows (8 on a view with
 *  none, or the cap on a view stored above it) reads as the projection and is not
 *  written. A view setting, never a row; picking it on a full page writes it. */
export function withoutProjectedLimits(
  views: NotionState["views"],
  stored: NotionState["views"],
  options: KnownDatabaseAdapterOptions,
  previous?: NotionState["views"],
): NotionState["views"] {
  const limits = resolveLimits(options);
  if (limits.fill === undefined && limits.cap === undefined) return views;
  const written: NotionState["views"] = {};
  for (const [viewId, view] of Object.entries(views)) {
    written[viewId] = previous?.[viewId] === view ? view : unprojectView(view, stored[viewId], limits);
  }
  return written;
}
