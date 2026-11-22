// The open page, its outbox and the fake bridge, driven together: a content fetch
// (usePageStore.fetchPageContent, what an approved add_blocks triggers through
// reloadWrittenPage) and the save after it (publishOutboxPage) run their real code
// against the version rule of ./page-version.fixtures.

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import "./support/user-store-env.ts";
import { bridgeDeps, fakeRecovery, pageEntry, type FakeBridge } from "./page-version.fixtures";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { PAGE_OUTBOX_KEY, pageStamp, saveOutboxLedger } = await import("../../src/store/sync/pageStamp.ts");
const { publishOutboxPage } = await import("../../src/store/sync/pageFlush.ts");
const { publishPage } = await import("../../src/store/sync/pageOutbox.ts");
const { clearBase, setBase } = await import("../../src/store/sync/pageBase.ts");
const { loadLedger } = await import("../../packages/outbox-ledger/src/index.ts");

export const PAGE_ID = "22222222-2222-4222-8222-222222222222";
/** The server's clock for every row it answers: older than any keystroke made in a test. */
export const SERVER_TIME = "2026-01-01T00:00:00.000Z";

Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: "owner", privateWorkspaces: [{ _id: "ws" }], sharedWorkspaces: [] }) }),
  subscribe: () => () => undefined,
});

/** GET /api/pages/:id answers the fake bridge's row. */
export function serveReads(bridge: FakeBridge): void {
  globalThis.fetch = (async (url: string) => {
    const id = decodeURIComponent(String(url).split("/api/pages/")[1] ?? "");
    const row = bridge.pages.get(id);
    if (!row) return new Response(JSON.stringify({ ok: false }), { status: 404 });
    const entry = pageEntry(id, row.content, { contentVersion: row.version, updatedAt: SERVER_TIME });
    return new Response(JSON.stringify(entry), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

/** The page as the client loaded it at `version`: store, ledger and base agree. */
export function loadPage(content: Block[], version: number, overrides: Partial<PageEntry> = {}): void {
  localStorage.clear();
  clearBase(PAGE_ID);
  const page = pageEntry(PAGE_ID, content, { updatedAt: SERVER_TIME, ...overrides });
  usePageStore.setState({ ...derivePageState({ ws: [page] }), pageRevisions: {} });
  saveOutboxLedger(PAGE_OUTBOX_KEY, { [PAGE_ID]: pageStamp(page) });
  setBase(PAGE_ID, version, content);
}

export const openPage = (): PageEntry => usePageStore.getState().pageById(PAGE_ID)!;

/** A keystroke: the store's own edit action, so the page becomes unpublished. */
export function typeLocally(content: Block[]): void {
  usePageStore.getState().updatePageContent(PAGE_ID, content);
}

/** The refresh an applied write triggers. */
export async function refresh(): Promise<void> {
  await usePageStore.getState().fetchPageContent(PAGE_ID, "jwt");
}

/** The outbox's next save of the open page; true when it went to the copy path. */
export async function save(bridge: FakeBridge): Promise<boolean> {
  const page = openPage();
  const confirmed = loadLedger(PAGE_OUTBOX_KEY);
  if (confirmed[PAGE_ID] === pageStamp(page)) return false;
  const recovery = fakeRecovery("unreadable", null);
  const outbox = bridgeDeps(bridge);
  await publishOutboxPage(
    { page, id: PAGE_ID, stamp: pageStamp(page), confirmed, forgotten: new Set(), budget: { left: 1 } },
    {
      publish: (target) => publishPage(target, outbox),
      recovery: recovery.deps,
      privateWorkspaceId: () => "ws",
      notify: () => undefined,
      applyContent: (id, content) => { typeLocally(content); return usePageStore.getState().pageById(id) ?? null; },
      latest: (id) => usePageStore.getState().pageById(id) ?? null,
      recordVersion: (id, version) => usePageStore.getState().setPageContentVersion(id, version),
    },
  );
  saveOutboxLedger(PAGE_OUTBOX_KEY, confirmed);
  return recovery.calls.length > 0;
}

/** The ids of a flat list of blocks, in order. */
export const blockIds = (blocks: readonly Block[]): string[] => blocks.map((block) => block.id);

/** The text of one block, or undefined when the tree lacks it. */
export const textOf = (blocks: readonly Block[], id: string): string | undefined =>
  blocks.find((block) => block.id === id)?.content as string | undefined;
