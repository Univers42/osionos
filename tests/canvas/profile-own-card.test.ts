/**
 * GET /api/users/:username looks a card up BY NAME. The legacy and typed tables can disagree
 * about who holds a name (measured on beta: the legacy row of account A says "dylan", the
 * card under "dylan" is account B's), so a card is merged only when it is the requested
 * user's, and the owner falls back to their own row.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const { loadProfile } = await import("../../src/widgets/profile-page/useProfile.ts");

const A = "0a1b2c3d-0000-4000-8000-00000000000a";
const B = "0b1b2c3d-0000-4000-8000-00000000000b";
const LEGACY = { userId: A, name: "legacy", avatar: null, username: "dylan", headline: "old", bio: "old", location: "old", lastSeenAt: null, online: false };
const OWN = {
  userId: A, displayName: "Ada Lovelace", username: null, headline: "Engineer", location: "London",
  avatarUrl: "/api/media/avatars/a.webp", bannerUrl: "/api/media/avatars/a-banner.webp", readmePageId: null,
};

function fakeIo(card: Record<string, unknown> | Error, own: unknown = { ok: true, profile: OWN }) {
  const calls = { card: 0, own: 0 };
  const io = {
    getLegacy: async () => ({ ...LEGACY }) as never,
    getCard: async () => { calls.card++; if (card instanceof Error) throw card; return card; },
    getOwn: async () => { calls.own++; return own as never; },
  };
  return { io, calls };
}

test("a card of another account contributes nothing, not even the name", async () => {
  const { io } = fakeIo({ userId: B, displayName: "dev", headline: "theirs", avatarUrl: "/api/media/b.webp", readme: { pageId: "p" }, status: { text: "x" } });
  const merged = await loadProfile(A, false, io);
  assert.equal(merged.name, "legacy");
  assert.equal(merged.headline, null);
  assert.equal(merged.avatarUrl, undefined);
  assert.equal(merged.readme, undefined);
  assert.equal(merged.status, undefined);
});

test("a matching card is merged as before, the id compared case-insensitively", async () => {
  const { io } = fakeIo({ userId: A.toUpperCase(), displayName: "Card Name", headline: "From card", avatarUrl: "/api/media/a.webp" });
  const merged = await loadProfile(A, false, io);
  assert.equal(merged.name, "Card Name");
  assert.equal(merged.headline, "From card");
  assert.equal(merged.avatarUrl, "https://bridge.test/api/media/a.webp");
});

test("the owner with a foreign card gets the public fields from their own row", async () => {
  const { io, calls } = fakeIo({ userId: B, displayName: "dev" });
  const merged = await loadProfile(A, true, io);
  assert.deepEqual(
    [merged.name, merged.headline, merged.location, merged.avatarUrl, merged.bannerUrl],
    ["Ada Lovelace", "Engineer", "London", "https://bridge.test/api/media/avatars/a.webp", "https://bridge.test/api/media/avatars/a-banner.webp"],
  );
  assert.equal(calls.own, 1);
});

test("the owner without a username or after a failed card read falls back too", async () => {
  const noName = fakeIo({ userId: A });
  const withoutUsername = await loadProfile(A, true, { ...noName.io, getLegacy: async () => ({ ...LEGACY, username: null }) as never });
  assert.equal(withoutUsername.headline, "Engineer");
  assert.equal(noName.calls.card, 0);
  const failed = await loadProfile(A, true, fakeIo(new Error("503")).io);
  assert.equal(failed.name, "Ada Lovelace");
});

test("the owner with a matching card never reads their own row", async () => {
  const { io, calls } = fakeIo({ userId: A, displayName: "Card Name" });
  assert.equal((await loadProfile(A, true, io)).name, "Card Name");
  assert.equal(calls.own, 0);
});

test("a failed own-row read keeps the first read and raises nothing", async () => {
  const { io } = fakeIo({ userId: B }, { ok: false, reason: "failed", message: "x" });
  const merged = await loadProfile(A, true, io);
  assert.equal(merged.name, "legacy");
  assert.equal(merged.headline, null);
  const thrown = fakeIo({ userId: B }).io;
  const merged2 = await loadProfile(A, true, { ...thrown, getOwn: async () => { throw new Error("net"); } });
  assert.equal(merged2.name, "legacy");
});

test("a visitor never triggers the own-row read, with or without a matching card", async () => {
  for (const card of [{ userId: B }, { userId: A, displayName: "Card" }, new Error("503")]) {
    const { io, calls } = fakeIo(card);
    await loadProfile(A, false, io);
    assert.equal(calls.own, 0);
  }
});
