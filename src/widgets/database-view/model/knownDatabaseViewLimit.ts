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
