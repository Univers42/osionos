import assert from "node:assert/strict";
import test from "node:test";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { PAGE_OUTBOX_KEY, pageStamp, saveOutboxLedger } = await import("../../src/store/sync/pageStamp.ts");
const { loadLedger } = await import("../../packages/outbox-ledger/src/index.ts");

const original = (): PageEntry => ({
  _id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace",
  title: "Shared page",
  visibility: "shared",
  ownerId: "author",
  content: [{ id: "text", type: "paragraph", content: "before" }],
  contentVersion: 4,
  updatedAt: "2026-10-21T00:00:00.000Z",
} as PageEntry);

const viewerSession = {
  userId: "viewer",
  privateWorkspaces: [],
  sharedWorkspaces: [{ _id: "workspace", role: "viewer", permissions: ["read"] }],
};
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => viewerSession }),
});

function seed(page: PageEntry) {
  localStorage.clear();
  usePageStore.setState({ ...derivePageState({ workspace: [page] }), pageRevisions: {} });
}

test("a remote update and confirmed version coexist without creating an outbox echo", () => {
  const page = original();
  seed(page);
  saveOutboxLedger(PAGE_OUTBOX_KEY, { [page._id]: pageStamp(page) });
  const content = [{ id: "text", type: "paragraph" as const, content: "remote edit" }];

  usePageStore.getState().applyRemoteContent(page._id, content);
  usePageStore.getState().setPageContentVersion(page._id, 5);

  const after = usePageStore.getState().pageById(page._id)!;
  assert.equal(after.content, content);
  assert.equal(after.contentVersion, 5);
  assert.equal(after.updatedAt, page.updatedAt);
  assert.equal(usePageStore.getState().pageRevisions[page._id], 1);
  assert.equal(loadLedger(PAGE_OUTBOX_KEY)[page._id], pageStamp(after));
});

test("remote blocks and a version update leave a pending local title unpublished", () => {
  const confirmed = original();
  const local = { ...confirmed, title: "My pending title" };
  seed(local);
  const stamp = pageStamp(confirmed);
  saveOutboxLedger(PAGE_OUTBOX_KEY, { [local._id]: stamp });

  usePageStore.getState().setPageContentVersion(local._id, 5);
  usePageStore.getState().applyRemoteContent(local._id, [{ id: "text", type: "paragraph", content: "remote edit" }]);

  const after = usePageStore.getState().pageById(local._id)!;
  assert.equal(after.title, local.title);
  assert.equal(after.contentVersion, 5);
  assert.equal(loadLedger(PAGE_OUTBOX_KEY)[local._id], stamp);
  assert.notEqual(pageStamp(after), stamp, "the outbox must still see the local edit");
});
