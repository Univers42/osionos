/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emails-env.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Browser globals the emails store reads: window, localStorage and the user-store seam.

export const memory = new Map<string, string>();
Reflect.set(globalThis, "window", globalThis);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.tok", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});
