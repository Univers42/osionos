/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-mounts-stubs.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { registerHooks } from "node:module";

/** workspaceMounts reaches the app's API client (`import.meta.env`, which Vite
 *  injects) and the zustand page store (which statically imports a JSON seed
 *  without an import attribute): neither loads under node. Only those two
 *  specifiers are replaced — the REAL sandboxHealthStore and mount code run. */
const CLIENT_STUB = `
export const API_BASE = "";
export function getActivePageJwt() { return null; }
`;
// The page store is only reached in degraded mode, by pageProvider.watch ->
// facade.subscribe; the counters let a test see which backend a watch landed on.
const STORE_STUB = `
const control = globalThis.__workspaceMountStub;
export const usePageStore = {
  getState: () => ({ pages: {} }),
  subscribe: () => {
    control.pageStoreSubscribes += 1;
    if (control.failPageStoreSubscribe) throw new Error("page store subscribe failed");
    return () => {};
  },
};
`;
const CLIENT_URL = `data:text/javascript,${encodeURIComponent(CLIENT_STUB)}`;
const STORE_URL = `data:text/javascript,${encodeURIComponent(STORE_STUB)}`;

export interface MountStubControl {
  pageStoreSubscribes: number;
  failPageStoreSubscribe: boolean;
}

export const control: MountStubControl = { pageStoreSubscribes: 0, failPageStoreSubscribe: false };

let installed = false;

/** Install the resolve hooks ONCE per process, BEFORE the dynamic import of
 *  workspaceMounts: static imports resolve before any module body runs, so a
 *  hook installed by a static import's side effect would come too late. */
export function installWorkspaceMountStubs(): void {
  if (installed) return;
  installed = true;
  Reflect.set(globalThis, "__workspaceMountStub", control);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@/shared/api/client") return { url: CLIENT_URL, shortCircuit: true };
      if (specifier === "@/store/usePageStore") return { url: STORE_URL, shortCircuit: true };
      const resolved = nextResolve(specifier, context);
      if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: CLIENT_URL, shortCircuit: true };
      if (resolved.url.endsWith("/src/store/usePageStore.ts")) return { url: STORE_URL, shortCircuit: true };
      return resolved;
    },
  });
}
