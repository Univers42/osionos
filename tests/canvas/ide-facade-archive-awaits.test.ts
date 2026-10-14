/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-facade-archive-awaits.test.ts                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// inboundArchive marks a shell-deleted subtree, awaits the facade's archive, then gives every
// page still live its mark back; unawaited, that give-back runs before the server answers. The
// live inbound side archives through pageFileFacadeStore, which awaits; this facade (today only
// ideTasks, which never archives) did not (devil aside, 2026-10-14). The page store and the api
// client do not load under node (a JSON seed, `import.meta.env`), so both are stubbed here.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const STORE_STUB = `export const usePageStore = { getState: () => globalThis.__facadeArchiveStore };`;
const CLIENT_STUB = `export const API_BASE = ""; export function getActivePageJwt() { return "jwt"; }`;
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/store/usePageStore") return { url: url(STORE_STUB), shortCircuit: true };
    if (specifier === "@/shared/api/client") return { url: url(CLIENT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/store/usePageStore.ts")) return { url: url(STORE_STUB), shortCircuit: true };
    if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: url(CLIENT_STUB), shortCircuit: true };
    return resolved;
  },
});
const { pageStoreFacade } = await import("../../src/features/ide/model/pageStoreFacade.ts");

test("the facade's archive resolves only once the store's archive has", async () => {
  let answer = (): void => {};
  const calls: string[] = [];
  Reflect.set(globalThis, "__facadeArchiveStore", {
    archivePage: (id: string, workspaceId: string, jwt: string) => {
      calls.push(`${id} ${workspaceId} ${jwt}`);
      return new Promise<void>((resolve) => { answer = resolve; });
    },
  });
  let settled = false;
  const archived = pageStoreFacade("ws").archive("p1").then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ["p1 ws jwt"]);
  assert.equal(settled, false, "resolved before the server answered");
  answer();
  await archived;
  assert.equal(settled, true);
});
