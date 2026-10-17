import assert from "node:assert/strict";
import test from "node:test";

import { importLegacyDraw, MAX_IMPORT_ELEMENTS, parseLegacyScene } from "../../src/features/whiteboard/model/legacyDrawImport.ts";
import { createWhiteboardClient, WhiteboardApiError, type WhiteboardClient } from "../../src/features/whiteboard/model/whiteboardClient.ts";

const scene = (elements: unknown[]) => JSON.stringify({ type: "osidraw", version: 1, elements });
const elements = [{ id: "a" }, { id: "b" }, { id: "c", isDeleted: true }];

function fakeClient(overrides: Partial<WhiteboardClient> = {}): WhiteboardClient & { created: number; imported: number } {
  const client = {
    created: 0,
    imported: 0,
    createBoard: async () => { client.created += 1; return { slug: "abc123" }; },
    importScene: async (slug: string, sent: readonly unknown[]) => {
      client.imported += 1;
      return { slug, elementCount: sent.filter((e) => (e as { isDeleted?: boolean }).isDeleted !== true).length };
    },
    ...overrides,
  };
  return client;
}

test("parseLegacyScene: empty is a blank drawing, non-osidraw is a failure", () => {
  assert.deepEqual(parseLegacyScene(""), []);
  assert.deepEqual(parseLegacyScene(scene(elements)), elements);
  assert.equal(parseLegacyScene("not json"), null);
  assert.equal(parseLegacyScene('{"type":"other","elements":[]}'), null);
  assert.equal(parseLegacyScene('{"type":"osidraw"}'), null);
});

test("success needs the returned live count to equal the count sent", async () => {
  const client = fakeClient();
  const result = await importLegacyDraw({ content: scene(elements), title: "Plan", client });
  assert.deepEqual(result, { ok: true, slug: "abc123", title: "Plan" });
});

test("a 2xx that kept fewer elements is a failure that keeps the slug for Retry", async () => {
  const client = fakeClient({ importScene: async (slug) => ({ slug, elementCount: 1 }) });
  const result = await importLegacyDraw({ content: scene(elements), title: "Plan", client });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.slug, "abc123");
});

test("Retry reuses the board instead of creating another", async () => {
  const client = fakeClient();
  const result = await importLegacyDraw({ content: scene(elements), title: "Plan", existingSlug: "zzz999", client });
  assert.equal(client.created, 0);
  assert.equal(result.ok && result.slug, "zzz999");
});

test("an unreadable or oversized scene never reaches the service", async () => {
  const client = fakeClient();
  const bad = await importLegacyDraw({ content: "nope", title: "Plan", client });
  const big = await importLegacyDraw({ content: scene(new Array(MAX_IMPORT_ELEMENTS + 1).fill({ id: "x" })), title: "Plan", client });
  assert.equal(bad.ok, false);
  assert.equal(big.ok, false);
  assert.equal(client.created + client.imported, 0);
});

test("a service error becomes a failure with its message", async () => {
  const client = fakeClient({ importScene: async () => { throw new WhiteboardApiError(413, "too_large", "Too big."); } });
  const result = await importLegacyDraw({ content: scene(elements), title: "Plan", client });
  assert.deepEqual(result, { ok: false, message: "Too big.", slug: "abc123" });
});

test("the real client sends the osidraw envelope with If-Match and counts live scene elements", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const client = createWhiteboardClient(async (url, init) => {
    seen.push({ url, init });
    const body = init?.method === "POST" ? { slug: "abc123" } : { scene: { elements } };
    return new Response(JSON.stringify(body), { status: init?.method === "POST" ? 201 : 200 });
  });
  const result = await importLegacyDraw({ content: scene(elements), title: "Plan", client });
  assert.equal(result.ok, true);
  const put = seen[1];
  assert.match(put.url, /\/v1\/boards\/abc123$/);
  assert.equal((put.init?.headers as Record<string, string>)["If-Match"], "*");
  assert.equal(JSON.parse(String(put.init?.body)).type, "osidraw");
});

test("the real client maps a non-2xx envelope to WhiteboardApiError", async () => {
  const client = createWhiteboardClient(async () => new Response(JSON.stringify({ error: { code: "invalid", message: "Bad title." } }), { status: 400 }));
  await assert.rejects(client.createBoard("x"), (error: WhiteboardApiError) => error.status === 400 && error.code === "invalid" && error.message === "Bad title.");
});
