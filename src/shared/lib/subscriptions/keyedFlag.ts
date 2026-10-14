/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keyedFlag.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useSyncExternalStore } from "react";

export interface KeyedFlag {
  /** Calls `listener` whenever "the current key is `key`" flips. */
  subscribe(key: string, listener: () => void): () => void;
  /** Whether the current key is `key`. */
  is(key: string): boolean;
}

/**
 * "Is this row the selected one?" for a list of rows, at O(1) per change instead of O(rows).
 * A prop or a per-row store selector re-runs for every row whenever the selection (or, for a
 * selector, anything in the store) changes; here one store listener compares the key and wakes
 * only the listeners of the old and the new key. The store subscription is held only while
 * some row listens.
 */
export function createKeyedFlag(
  subscribeStore: (onChange: () => void) => () => void,
  readKey: () => string | null,
): KeyedFlag {
  const listeners = new Map<string, Set<() => void>>();
  let current: string | null = null;
  let detach: (() => void) | null = null;
  const wake = (key: string | null) => {
    if (key !== null) listeners.get(key)?.forEach((listener) => listener());
  };
  const onStoreChange = () => {
    const next = readKey();
    if (next === current) return;
    const previous = current;
    current = next;
    wake(previous);
    wake(next);
  };
  return {
    is: (key) => readKey() === key,
    subscribe(key, listener) {
      if (!detach) {
        current = readKey();
        detach = subscribeStore(onStoreChange);
      }
      const keyed = listeners.get(key) ?? new Set<() => void>();
      listeners.set(key, keyed);
      keyed.add(listener);
      return () => {
        keyed.delete(listener);
        if (keyed.size === 0) listeners.delete(key);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
        }
      };
    },
  };
}

/** React binding: re-renders the caller only when its own answer flips. */
export function useKeyedFlag(flag: KeyedFlag, key: string): boolean {
  const subscribe = useCallback((listener: () => void) => flag.subscribe(key, listener), [flag, key]);
  return useSyncExternalStore(subscribe, () => flag.is(key));
}
