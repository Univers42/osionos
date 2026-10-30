/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-related-pages.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The related pages under a page title (#33): the client reads the service's
 * embedding neighbours (`GET /pages/:id/related?k=`) through the one AI
 * transport, and a refusal is an error the panel shows, never an empty list
 * that would read as "no related page".
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// relatedPages.ts imports the plain aiClient.ts, so THAT module gets the env of a
// build with the service configured (the ?env= query would make a second client).
const AI_CLIENT = new URL("../../src/features/ai/api/aiClient.ts", import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== AI_CLIENT || typeof result !== "object" || !result || !("source" in result)) return result;
    const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
    return { ...result, source: `import.meta.env ??= { VITE_AI_URL: "https://ai.test" };\n${source}` };
  },
});

const { setAiTransport } = await import("@/features/ai/api/aiClient");
const { listRelatedPages } = await import("@/features/ai/api/relatedPages");

const PAGE = "0b6f8d1e-2a4c-4e8b-9f10-3c5d7e9a1b2c";

/** Answers every request with `answer`, and records it. */
function serviceAnswering(answer: () => Response): { url: string; method: string }[] {
  const calls: { url: string; method: string }[] = [];
  setAiTransport(async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return answer();
  });
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("the related pages are the service's neighbours of the page, k of them", async () => {
  const related = [
    { pageId: "p-2", title: "Kafka notes", score: 0.91, linked: true },
    { pageId: "p-3", title: "Event sourcing", score: 0.84, linked: false },
  ];
  const calls = serviceAnswering(() => json({ related }));
  assert.deepEqual(await listRelatedPages(PAGE, 5), related);
  assert.deepEqual(calls, [{ url: `https://ai.test/api/ai/pages/${PAGE}/related?k=5`, method: "GET" }]);
});

test("an answer without a list is no related page", async () => {
  serviceAnswering(() => json({}));
  assert.deepEqual(await listRelatedPages(PAGE), []);
});

test("a refusal is an error, never an empty list", async () => {
  const calls = serviceAnswering(() => json({ error: "unavailable" }, 503));
  await assert.rejects(listRelatedPages(PAGE));
  assert.equal(calls.length, 1, "the refusal came from the service, not from a URL that never went out");
});
