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

// Shared by the admin panels' canvas tests: gives the api client the env vite would inject,
// and runs a body against a fetch that answers from `reply` and records every call.
// Importing this file registers the loader hook, so import it before the module under test.

import { registerHooks } from "node:module";

const CLIENT = new URL("../../../src/shared/api/client.ts", import.meta.url).href;

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url === CLIENT && typeof result === "object" && result && "source" in result) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

export type Call = { url: string; method: string; body: Record<string, unknown> | null };
export type Reply = { status?: number; body: unknown };

export async function withBridge(reply: (call: Call) => Reply, run: () => Promise<void>): Promise<Call[]> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    calls.push(call);
    const { status = 200, body } = reply(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
  return calls;
}
