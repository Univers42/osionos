/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMediaQuery.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useSyncExternalStore } from "react";

/** Whether the CSS media `query` matches now, re-rendering only when that flips. Subscribe and
 *  the snapshot are stable per query, so React never resubscribes on a render. False on the
 *  server and wherever `matchMedia` is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof globalThis.matchMedia !== "function") return () => undefined;
      const list = globalThis.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => typeof globalThis.matchMedia === "function" && globalThis.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
