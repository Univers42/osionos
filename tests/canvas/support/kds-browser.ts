/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   kds-browser.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The browser globals the known-database modules read at evaluation: with a `window`, the page
// store helpers the durable copy imports register a pagehide listener on globalThis, and the
// bridge sync reads the playground user's JWT. Import memory-local-storage.ts before this module.

Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
for (const name of ["addEventListener", "removeEventListener"] as const) {
  if (typeof globalThis[name] !== "function") Object.defineProperty(globalThis, name, { configurable: true, value: () => undefined });
}
(globalThis as Record<string, unknown>).__playgroundUserStore = { getState: () => ({ activePageJwt: () => "test-jwt" }) };
