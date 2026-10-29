/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   feed-comments-moderation.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The FEED's comment composer answers L0's warning.
 *
 * The page-comment panel already answers it (features/comments/ui/CommentsPanel
 * .tsx). The feed's composer lives in the kit, and the kit's `feedFetch`
 * answered null for EVERY non-2xx: the 409 moderation warning was swallowed,
 * the optimistic comment was dropped, and the author's words vanished with no
 * explanation at all. Here the failure is KEPT (the status and the bridge's
 * body), the write is TYPED, and the answer says what to show.
 *
 * The kit's bridge module reads `import.meta.env` (only Vite defines it), so
 * the env is injected here — the module under test is the real one, not a stub.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const KIT = "../../src/shared/notion-database-sys/src/components/views/feed";

/** The env the kit's bridge reads: the bridge URL it calls. */
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.includes("feedBridge.ts")) return loaded;
    const source = typeof loaded.source === "string" ? loaded.source : loaded.source?.toString() ?? "";
    return { ...loaded, source: `import.meta.env ??= { VITE_API_URL: "http://bridge.test" };\n${source}` };
  },
});

const { feedFetch, feedFetchResult } = await import(`${KIT}/feedBridge.ts`);
const { addFeedComment, applyAddResult, writeResult } = await import(`${KIT}/useFeedComments.ts`);

type Mode = "warn" | "details-only" | "ok" | "held" | "not-found";

interface Recorded { url: string; method: string; body?: Record<string, unknown> }

const recorded: Recorded[] = [];
let mode: Mode = "warn";

const MESSAGE = "This may hurt someone. Edit it, or post it anyway.";
const json = (value: unknown, status: number) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** The bridge's answers: the warning, the warning without the flat lists, the
 *  written comment (held or visible), and the absent route. */
Reflect.set(globalThis, "fetch", async (url: string, init: { method: string; body?: string }) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  recorded.push({ url: String(url), method: init.method, body });
  if (mode === "not-found") return json({ error: "Not found" }, 404);
  const acknowledged = body?.acknowledgeWarning === true;
  if (!acknowledged && (mode === "warn" || mode === "details-only")) {
    // The bridge keeps the lists at the top level AND in `details`: the app's
    // HTTP client keeps the envelope's known fields only, so the flat ones may
    // be missing on the way to the composer.
    const flat = mode === "warn" ? { reasons: ["blocklist"], terms: ["foul"] } : {};
    return json({
      ok: false,
      code: "moderation_warning",
      message: MESSAGE,
      ...flat,
      details: { reasons: ["blocklist"], terms: ["foul"] },
    }, 409);
  }
  const comment = {
    id: "comment-1",
    pageId: "page-1",
    authorId: "me",
    authorName: "You",
    authorAvatar: null,
    content: body?.content,
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: null,
    parentId: null,
    moderationState: mode === "held" ? "held" : "visible",
  };
  return json({ ...comment, ok: true, comment }, 201);
});

/** The kit reads the app JWT off this global (its decoupling seam). */
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({
    activePageJwt: () => "jwt",
    activeJwt: () => null,
    activePersona: () => ({ id: "me" }),
  }),
});

const EXISTING = {
  id: "comment-0", authorId: "other", authorName: "Someone", authorAvatar: null,
  content: "hello", createdAt: "2026-10-22T00:00:00.000Z", updatedAt: null, parentId: null,
};
const TEMP = {
  id: "temp-1", authorId: "me", authorName: "You", authorAvatar: null,
  content: "a rude comment", createdAt: "2026-10-22T00:00:00.000Z", updatedAt: null, parentId: null,
};

test("feedFetchResult keeps the failure: a 409 is an answer, not a hole", async () => {
  mode = "warn";
  const reply = await feedFetchResult("POST", "/api/feed/page-1/comments", { content: "a rude comment" });
  assert.ok(reply, "the answer is not null");
  assert.equal(reply.ok, false);
  assert.equal(reply.ok ? 0 : reply.status, 409);
  const body = reply.ok ? null : reply.body as { code?: string; message?: string };
  assert.equal(body?.code, "moderation_warning");
  assert.equal(body?.message, MESSAGE);
});

test("feedFetchResult answers the written comment with its data", async () => {
  mode = "ok";
  const reply = await feedFetchResult("POST", "/api/feed/page-1/comments", { content: "hello" });
  assert.ok(reply?.ok);
  assert.equal(reply?.ok ? reply.data.content : null, "hello");
  assert.equal(reply?.ok ? reply.data.moderationState : null, "visible");
});

test("a GET 404 still disables the feature (the old contract)", async () => {
  // A FRESH instance of the module: the feature-detection latch is per module,
  // and this test is the one that latches it off.
  const fresh = await import(`${KIT}/feedBridge.ts?case=not-found`);
  mode = "not-found";
  const before = recorded.length;
  const first = await fresh.feedFetch("GET", "/api/feed/page-1/comments");
  assert.equal(first, null, "feedFetch answers null for a failure");
  const second = await fresh.feedFetchResult("GET", "/api/feed/page-1/comments");
  assert.equal(second, null, "the feature is off: no second answer at all");
  assert.equal(recorded.length - before, 1, "the bridge was asked once");
});

test("the add answers a warning: the message, the codes and the terms reach the composer", async () => {
  mode = "warn";
  const reply = await addFeedComment("page-1", "a rude comment", undefined, false);
  const result = writeResult(reply);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && "warning" in result, "the answer is not a warning");
  const warning = !result.ok && "warning" in result ? result.warning : null;
  assert.equal(warning?.message, MESSAGE);
  assert.deepEqual(warning?.reasons, ["blocklist"]);
  assert.deepEqual(warning?.terms, ["foul"]);
});

test("the lists fall back to details when the envelope keeps only those", async () => {
  mode = "details-only";
  const reply = await addFeedComment("page-1", "a rude comment", undefined, false);
  const result = writeResult(reply);
  const warning = !result.ok && "warning" in result ? result.warning : null;
  assert.deepEqual(warning?.reasons, ["blocklist"]);
  assert.deepEqual(warning?.terms, ["foul"]);
});

test("a warned comment is not in the list: the optimistic one is taken back out", async () => {
  mode = "warn";
  const reply = await addFeedComment("page-1", "a rude comment", undefined, false);
  const list = applyAddResult([EXISTING, TEMP], TEMP, reply);
  assert.deepEqual(list, [EXISTING], "the list is what it was before the add");
});

test("the author may post it anyway: the second call carries acknowledgeWarning", async () => {
  mode = "warn";
  const warned = await addFeedComment("page-1", "a rude comment", undefined, false);
  assert.equal(warned?.ok, false);
  const posted = await addFeedComment("page-1", "a rude comment", undefined, true);
  assert.ok(posted?.ok);
  const last = recorded[recorded.length - 1];
  assert.equal(last.method, "POST");
  assert.equal(last.url, "http://bridge.test/api/feed/page-1/comments");
  assert.equal(last.body?.acknowledgeWarning, true);
  assert.equal(last.body?.content, "a rude comment");
  const list = applyAddResult([TEMP], TEMP, posted);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "comment-1");
  assert.equal(list[0].content, "a rude comment");
});

test("a comment written held keeps its state: only the author sees it", async () => {
  mode = "held";
  const reply = await addFeedComment("page-1", "a risky comment", undefined, true);
  assert.ok(reply?.ok);
  const list = applyAddResult([TEMP], TEMP, reply);
  assert.equal(list.length, 1);
  assert.equal(list[0].moderationState, "held");
});
