/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   refusing-indexed-db.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A browser for the known-database store module: IndexedDB refuses the open after `delayMs`, so
// readiness falls back to the localStorage copy and stays pending until then. Node has no
// window events; the module registers pagehide and visibilitychange listeners at evaluation.
// Import memory-local-storage.ts before this module.

export function installRefusingBrowser(delayMs: number): void {
  const indexedDB = {
    open: () => {
      const request: { error: null; onerror?: () => void } = { error: null };
      setTimeout(() => request.onerror?.(), delayMs);
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
  for (const name of ["addEventListener", "removeEventListener"] as const) {
    if (typeof globalThis[name] !== "function") Object.defineProperty(globalThis, name, { configurable: true, value: () => undefined });
  }
}
