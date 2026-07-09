/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordLimitAdapter.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ObjectDatabaseAdapter } from "@notion-db/object-database";

/**
 * Bound how many records an inline database embed shows — the block-level
 * "number of records to display" property. Mirrors the known adapter's
 * `applyAdapterOptions`, but generically: it proxies ANY adapter and caps every
 * paginated view's `loadLimit` in the state it loads, so the embed renders at
 * most N rows and its height follows the record count instead of overflowing.
 *
 * A Proxy (not object spread) is used so class-instance adapters keep their
 * prototype methods and `this` binding — only `loadState` is intercepted.
 */
const CAPPED_VIEW_TYPES = new Set(["table", "list", "timeline"]);

function capViewsLoadLimit(state: unknown, limit: number): unknown {
  if (!state || typeof state !== "object") return state;
  const views = (state as { views?: Record<string, { type?: string; settings?: { loadLimit?: number } }> }).views;
  if (!views) return state;
  const nextViews = Object.fromEntries(
    Object.entries(views).map(([viewId, view]) => {
      if (!CAPPED_VIEW_TYPES.has(view?.type ?? "")) return [viewId, view];
      const current = Number(view.settings?.loadLimit);
      const nextLimit = Number.isFinite(current) ? Math.min(current, limit) : limit;
      return [viewId, { ...view, settings: { ...view.settings, loadLimit: nextLimit } }];
    }),
  );
  return { ...state, views: nextViews };
}

export function withRecordLimit<T extends ObjectDatabaseAdapter | null | undefined>(
  adapter: T,
  recordLimit: number | undefined,
): T {
  if (!adapter || !recordLimit || !Number.isFinite(recordLimit)) return adapter;
  const limit = Math.max(1, Math.round(recordLimit));
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "loadState") {
        return async (...args: unknown[]) =>
          capViewsLoadLimit(await (target.loadState as (...a: unknown[]) => Promise<unknown>)(...args), limit);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
