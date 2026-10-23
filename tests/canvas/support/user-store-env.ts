/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stub-bridge.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Lets a canvas test import the real user store under node: seed users emptied, the vite env
// injected into the two modules that read it, and an in-memory localStorage.
// Importing this file registers the hooks, so import it before the store.

import { register } from "node:module";

const LOADER = `
export async function resolve(specifier, context, nextResolve) {
	const resolved = await nextResolve(specifier, context);
	if (resolved.url.endsWith("seedUsers.json")) {
		return { url: "data:application/json," + encodeURIComponent('{"users":[],"workspaces":[]}'), shortCircuit: true };
	}
	return resolved;
}
export async function load(url, context, nextLoad) {
	const loaded = await nextLoad(url, context);
	if (loaded.source == null) return loaded;
	if (!url.includes("userStore.helpers.ts") && !url.includes("shared/api/client.ts")) return loaded;
	const source = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
	return { ...loaded, source: "import.meta.env ??= { DEV: true, VITE_API_URL: 'https://bridge.test' };\\n" + source };
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});
