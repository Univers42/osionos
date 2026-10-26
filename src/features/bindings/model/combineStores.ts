/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   combineStores.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One store-shaped view over several stores. The combined `getState()` returns
 * the same object until one of the wrapped stores changes, and a subscriber
 * gets `(next, previous)` combined snapshots. Underlying stores are subscribed
 * on the first combined listener and released after the last one leaves.
 */

export type StoreLike<S> = {
  getState(): S;
  subscribe(listener: (state: S, previous: S) => void): () => void;
};

type Combined<M extends Record<string, StoreLike<unknown>>> = {
  [K in keyof M]: ReturnType<M[K]["getState"]>;
};

export function combineStores<M extends Record<string, StoreLike<unknown>>>(
  stores: M,
): StoreLike<Combined<M>> {
  const keys = Object.keys(stores) as Array<keyof M>;

  let current: Combined<M> | null = build();

  function build(): Combined<M> {
    const out = {} as Combined<M>;
    for (const key of keys) {
      (out as Record<string, unknown>)[key as string] = stores[key].getState();
    }
    return out;
  }

  function getCurrent(): Combined<M> {
    if (current === null) {
      current = build();
      return current;
    }
    let changed = false;
    for (const key of keys) {
      if (!Object.is(stores[key].getState(), current[key as keyof Combined<M>])) {
        changed = true;
        break;
      }
    }
    if (changed) current = build();
    return current;
  }

  const listeners = new Set<(next: Combined<M>, previous: Combined<M>) => void>();
  let underlyingUnsubs: Array<() => void> = [];
  let underlyingActive = false;

  function subscribeUnderlying(): void {
    if (underlyingActive) return;
    underlyingActive = true;
    for (const key of keys) {
      const store = stores[key];
      const unsub = store.subscribe(() => {
        const previous = current ?? build();
        current = build();
        for (const cb of [...listeners]) cb(current, previous);
      });
      underlyingUnsubs.push(unsub);
    }
  }

  function releaseUnderlying(): void {
    if (!underlyingActive) return;
    underlyingActive = false;
    for (const unsub of underlyingUnsubs) unsub();
    underlyingUnsubs = [];
  }

  return {
    getState(): Combined<M> {
      return getCurrent();
    },
    subscribe(listener: (state: Combined<M>, previous: Combined<M>) => void): () => void {
      const wasEmpty = listeners.size === 0;
      listeners.add(listener);
      if (wasEmpty) subscribeUnderlying();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) releaseUnderlying();
      };
    },
  };
}
