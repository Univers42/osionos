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

/**
 * Page-properties scope: reads the page's own properties through the page store.
 * Returns the same snapshot object while none of the requested keys' values
 * changed (Object.is per key), so it is a valid useSyncExternalStore snapshot.
 */
export function createPagePropertiesScope(pageId: string): VisibilityScope {
  let cachedKeys: readonly string[] | null = null;
  let cachedValues: unknown[] | null = null;
  let cachedSnapshot: PropertyMap | null = null;

  const read = (keys: readonly string[]): PropertyMap => {
    const properties = usePageStore.getState().pageById(pageId)?.properties;
    const propertyMap = resolvePropertyMap(properties as never);
    const values = keys.map((key) => propertyMap[key]);

    if (
      cachedSnapshot !== null &&
      cachedKeys !== null &&
      cachedValues !== null &&
      keys.length === cachedKeys.length &&
      keys.every((key, index) => key === cachedKeys![index]) &&
      values.every((value, index) => Object.is(value, cachedValues![index]))
    ) {
      return cachedSnapshot;
    }

    const snapshot: PropertyMap = {};
    for (const key of keys) snapshot[key] = propertyMap[key];
    cachedKeys = [...keys];
    cachedValues = values;
    cachedSnapshot = snapshot;
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