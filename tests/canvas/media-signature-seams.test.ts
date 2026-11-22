// osionos#233 D233-1: a rendered src is signed and dies within 2 h, so every content write seam
// stores the bare form — the store actions (paste, drop and typing all land in updateBlock,
// insertBlock or updatePageContent), the cover patches, the outbox PATCH and replaceInlineImages.
import assert from "node:assert/strict";
import test from "node:test";
import type { Block, PageEntry } from "../../src/entities/page/model/types.ts";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { publishPage } = await import("../../src/store/sync/pageOutbox.ts");
const { replaceInlineImages } = await import("../../src/shared/lib/media/inlineImages.ts");
const { bridgeDeps, createBridge } = await import("./page-version.fixtures.ts");

const P = "5b0c9a52-3f1e-4c7a-9d42-6a1f0e2b7c12";
const OWNER = "owner";
const BARE = `https://bridge.example/api/media/uploads/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/${"cd".repeat(32)}.png`;
const SIGNED = `${BARE}?exp=1763830800&kid=0a1b2c3d&sig=${"9f".repeat(32)}`;
const ownerSession = { userId: OWNER, privateWorkspaces: [{ _id: "ws" }], sharedWorkspaces: [] };
Reflect.set(globalThis, "__playgroundUserStore", { getState: () => ({ activeSession: () => ownerSession }) });

const image = (id: string, url: string): Block => ({ id, type: "image", content: "", url } as Block);

function seed(): void {
  const page = {
    _id: P, workspaceId: "ws", ownerId: OWNER, title: "Media", content: [image("b1", BARE)],
    cover: "linear-gradient(red, blue)", updatedAt: "2026-10-01T10:00:00.000Z",
  } as PageEntry;
  localStorage.clear();
  usePageStore.setState({ ...derivePageState({ ws: [page] }), pageRevisions: {} });
}

const stored = (): PageEntry => usePageStore.getState().pageById(P)!;
const storedText = (): string => JSON.stringify(stored());

test("updateBlock stores a pasted signed link bare", () => {
  seed();
  usePageStore.getState().updateBlock(P, "b1", { content: `![x](${SIGNED})`, url: SIGNED } as Partial<Block>);
  assert.ok(storedText().includes(BARE));
  assert.ok(!storedText().includes("sig="));
});

test("insertBlock stores a dropped signed image bare", () => {
  seed();
  usePageStore.getState().insertBlock(P, "b1", image("b2", SIGNED));
  assert.equal((stored().content as Block[])[1].url, BARE);
});

test("updatePageContent stores a pasted selection bare", () => {
  seed();
  usePageStore.getState().updatePageContent(P, [image("b1", SIGNED), { ...image("b3", ""), children: [image("b4", SIGNED)] }]);
  assert.ok(!storedText().includes("sig="));
});

test("patchPage and editPageHeader store a signed cover bare", () => {
  seed();
  usePageStore.getState().patchPage(P, { cover: SIGNED });
  assert.equal(stored().cover, BARE);
  seed();
  usePageStore.getState().patchPage(P, () => ({ cover: SIGNED }));
  assert.equal(stored().cover, BARE);
  seed();
  usePageStore.getState().editPageHeader(P, { cover: SIGNED });
  assert.equal(stored().cover, BARE);
});

test("the outbox PATCH never carries a signed link", async () => {
  const page = { _id: P, workspaceId: "ws", ownerId: OWNER, title: "t", cover: SIGNED, content: [image("b1", SIGNED)] } as PageEntry;
  const bridge = createBridge({ [P]: { version: 1, content: [] } });
  assert.equal((await publishPage(page, bridgeDeps(bridge))).result, "ok");
  assert.equal(bridge.patches[0].body.cover, BARE);
  assert.ok(!JSON.stringify(bridge.patches[0].body.content).includes("sig="));
});

test("replaceInlineImages writes the uploaded URL bare", () => {
  const data = "data:image/png;base64,AAAA";
  assert.deepEqual(replaceInlineImages({ url: data }, new Map([[data, SIGNED]])), { url: BARE });
});
