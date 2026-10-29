/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visibilityScope.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { createContext, useContext, useMemo } from "react";
import { usePageStore } from "@/store/usePageStore";
import { resolvePropertyMap } from "./visibility";
import type { PropertyMap } from "@/shared/notion-database-sys/src/lib/engine/bridge";

/**
 * @file visibilityScope.ts — the values a visibility formula reads from.
 *
 * A scope is a small external store: `read` returns a snapshot keyed by the
 * requested property keys, and `subscribe` notifies when any value changes.
 * Keeping the read scoped to the requested keys means a formula that only
 * reads `status` does not re-evaluate when an unrelated property changes.
 */

export interface VisibilityScope {
  read(keys: readonly string[]): PropertyMap;
  subscribe(onChange: () => void): () => void;
}

interface ScopeCacheEntry {
  propertiesRef: unknown;
  values: unknown[];
  snapshot: PropertyMap;
}

/**
 * Page-properties scope: reads the page's own properties through the page store.
 * Returns the same snapshot object while none of the requested keys' values
 * changed (Object.is per key), so it is a valid useSyncExternalStore snapshot.
 *
 * The cache is keyed per distinct key list, so two formulas reading different
 * keys never evict each other's snapshot.
 */
export function createPagePropertiesScope(pageId: string): VisibilityScope {
  const cache = new Map<string, ScopeCacheEntry>();

  const read = (keys: readonly string[]): PropertyMap => {
    const key = keys.join("\u0000");
    const properties = usePageStore.getState().pageById(pageId)?.properties;
    const entry = cache.get(key);

    // Short-circuit: the page's property list did not change identity, so the
    // snapshot built last time is still valid. Avoids rebuilding the map for
    // every gated block on every store change.
    if (entry && properties === entry.propertiesRef) {
      return entry.snapshot;
    }

    const propertyMap = resolvePropertyMap(properties as never);
    const values = keys.map((k) => propertyMap[k]);

    if (entry && values.every((value, index) => Object.is(value, entry.values[index]))) {
      entry.propertiesRef = properties;
      return entry.snapshot;
    }

    const snapshot: PropertyMap = {};
    for (const k of keys) snapshot[k] = propertyMap[k];
    cache.set(key, { propertiesRef: properties, values, snapshot });
    return snapshot;
  };

  const subscribe = (onChange: () => void): (() => void) => {
    return usePageStore.subscribe(() => {
      onChange();
    });
  };

  return { read, subscribe };
}

const VisibilityScopeContext = createContext<VisibilityScope | null>(null);

export function VisibilityScopeProvider({
  pageId,
  scope,
  children,
}: {
  pageId?: string;
  scope?: VisibilityScope | null;
  children: React.ReactNode;
}): React.ReactElement {
  const resolvedScope = useMemo<VisibilityScope | null>(() => {
    if (scope !== undefined) return scope;
    if (typeof pageId === "string" && pageId) return createPagePropertiesScope(pageId);
    return null;
  }, [pageId, scope]);
  return React.createElement(VisibilityScopeContext.Provider, { value: resolvedScope }, children);
}

export function useVisibilityScope(): VisibilityScope | null {
  return useContext(VisibilityScopeContext);
}