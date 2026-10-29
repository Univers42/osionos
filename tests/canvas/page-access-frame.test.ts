// A page_access frame re-reads only what it names: the page list of the open workspace, and the
// revoked page itself (so the server, not the frame, decides whether the copy is evicted).

import assert from "node:assert/strict";
import test from "node:test";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { applyPageAccess } = await import("../../src/widgets/notifications/model/useConnectionNotifications.ts");

const PAGE = "11111111-1111-4111-8111-111111111111";

function setup(activeWorkspaceId: string, held: boolean) {
  const lists: string[] = [];
  const contents: string[] = [];
  const pages = held ? [{ _id: PAGE, workspaceId: "ws1", title: "Plan", ownerId: "owner" } as PageEntry] : [];
  usePageStore.setState({
    ...derivePageState({ ws1: pages }),
    fetchPages: async (workspaceId: string) => { lists.push(workspaceId); },
    fetchPageContent: async (pageId: string) => { contents.push(pageId); },
  } as never);
  useUserStore.setState({
    activeWorkspace: () => ({ _id: activeWorkspaceId }),
    activePageJwt: () => "jwt",
  } as never);
  return { lists, contents };
}

test("a grant in the open workspace re-reads its page list once", () => {
  const { lists, contents } = setup("ws1", false);
  applyPageAccess({ workspaceId: "ws1", pageId: PAGE, op: "granted" });
  assert.deepEqual(lists, ["ws1"]);
  assert.deepEqual(contents, []);
});

test("a grant in another workspace re-reads nothing", () => {
  const { lists, contents } = setup("ws2", false);
  applyPageAccess({ workspaceId: "ws1", pageId: PAGE, op: "granted" });
  assert.deepEqual([lists, contents], [[], []]);
});

test("a revoke re-reads the held page so the server decides its eviction", () => {
  const { contents } = setup("ws2", true);
  applyPageAccess({ workspaceId: "ws1", pageId: PAGE, op: "revoked" });
  assert.deepEqual(contents, [PAGE]);
});

test("a revoke for a page this client never held re-reads nothing", () => {
  const { contents } = setup("ws2", false);
  applyPageAccess({ workspaceId: "ws1", pageId: PAGE, op: "revoked" });
  assert.deepEqual(contents, []);
});
