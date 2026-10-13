/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visibility-actions.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import {
  canChangePageVisibility,
  createPageAccessContext,
} from "../../src/shared/lib/auth/pageAccess.ts";
import type { PageEntry, PageVisibility } from "../../src/entities/page/model/types.ts";
import type { UserSession } from "../../src/entities/user/model/types.ts";
import { VISIBILITY_ACTIONS } from "../../src/features/page-management/context-menu/actions/visibilityActions.ts";
import type { MenuActionCtx } from "../../src/features/page-management/context-menu/types.ts";

// --- Test fixtures ----------------------------------------------------------

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";
const WORKSPACE_ID = "ws-1";
const PAGE_ID = "page-1";
const CHILD_ID = "page-child";

function makeSession(userId: string): UserSession {
  return {
    userId,
    accessToken: "tok",
    refreshToken: "rtok",
    privateWorkspaces: [{ _id: WORKSPACE_ID } as UserSession["privateWorkspaces"][number]],
    sharedWorkspaces: [],
  };
}

function setAccessContext(userId: string): void {
  (globalThis as Record<string, unknown>).__playgroundUserStore = {
    getState: () => ({ activeSession: () => makeSession(userId) }),
    subscribe: (listener: () => void) => { listener(); return () => {}; },
  };
}

function clearAccessContext(): void {
  delete (globalThis as Record<string, unknown>).__playgroundUserStore;
}

function makePage(overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: PAGE_ID,
    title: "Test Page",
    workspaceId: WORKSPACE_ID,
    ownerId: OWNER_ID,
    visibility: "private",
    surface: "page",
    ...overrides,
  };
}

function makeChildPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: CHILD_ID,
    title: "Child Page",
    workspaceId: WORKSPACE_ID,
    ownerId: OWNER_ID,
    parentPageId: PAGE_ID,
    surface: "page",
    ...overrides,
  };
}

interface RecordingStore {
  patches: Array<{ id: string; patch: Partial<PageEntry> }>;
  pages: PageEntry[];
}

function makeRecordingStore(pages: PageEntry[]): RecordingStore {
  return {
    patches: [],
    pages,
  };
}

function buildCtx(
  page: PageEntry,
  store: RecordingStore,
  toasts: Array<{ kind: string; title: string }>,
): MenuActionCtx {
  return {
    page,
    isFolder: page.surface === "folder",
    workspaceId: WORKSPACE_ID,
    jwt: "jwt",
    store: {
      getState: () => ({
        patchPage: (id: string, patch: Partial<PageEntry>) => {
          store.patches.push({ id, patch });
          const target = store.pages.find((p) => p._id === id);
          if (target) Object.assign(target, patch);
        },
        pageById: (id: string) => store.pages.find((p) => p._id === id),
      }),
    } as MenuActionCtx["store"],
    layout: { getState: () => ({}) } as MenuActionCtx["layout"],
    clipboard: { getState: () => ({}) } as MenuActionCtx["clipboard"],
    toast: (t: { kind: string; title: string }) => { toasts.push(t); },
    onRename: () => {},
    onDelete: () => {},
    workspacePages: () => store.pages,
  };
}

function findAction(id: "make-private" | "share-with-workspace") {
  const action = VISIBILITY_ACTIONS.find((a) => a.id === id);
  assert.ok(action, `action ${id} must be registered`);
  return action;
}

// --- canChangePageVisibility unit tests -------------------------------------

test("canChangePageVisibility: owner with context returns true", () => {
  const page = makePage({ ownerId: OWNER_ID });
  const ctx = createPageAccessContext(makeSession(OWNER_ID));
  assert.equal(canChangePageVisibility(page, ctx), true);
});

test("canChangePageVisibility: non-owner returns false", () => {
  const page = makePage({ ownerId: OWNER_ID });
  const ctx = createPageAccessContext(makeSession(OTHER_ID));
  assert.equal(canChangePageVisibility(page, ctx), false);
});

test("canChangePageVisibility: null owner returns false", () => {
  const page = makePage({ ownerId: null });
  const ctx = createPageAccessContext(makeSession(OWNER_ID));
  assert.equal(canChangePageVisibility(page, ctx), false);
});

test("canChangePageVisibility: null context returns false", () => {
  const page = makePage({ ownerId: OWNER_ID });
  assert.equal(canChangePageVisibility(page, null), false);
});

// --- Visibility actions enabled/disabled tests ------------------------------

test("make-private: enabled for owner on shared page", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "shared" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), true);
  clearAccessContext();
});

test("make-private: disabled for owner on private page (change not meaningful)", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), false);
  clearAccessContext();
});

test("make-private: disabled for owner on undefined visibility (normalises to private)", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: undefined });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), false);
  clearAccessContext();
});

test("make-private: disabled on public page", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "public" as PageVisibility });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), false);
  clearAccessContext();
});

test("make-private: disabled for non-owner", () => {
  setAccessContext(OTHER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "shared" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), false);
  clearAccessContext();
});

test("make-private: disabled when ownerId is null", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: null, visibility: "shared" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("make-private").enabled?.(ctx), false);
  clearAccessContext();
});

test("share-with-workspace: enabled for owner on private page", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("share-with-workspace").enabled?.(ctx), true);
  clearAccessContext();
});

test("share-with-workspace: disabled on public page", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "public" as PageVisibility });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("share-with-workspace").enabled?.(ctx), false);
  clearAccessContext();
});

test("share-with-workspace: disabled for non-owner", () => {
  setAccessContext(OTHER_ID);
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("share-with-workspace").enabled?.(ctx), false);
  clearAccessContext();
});

test("share-with-workspace: disabled when ownerId is null", () => {
  setAccessContext(OWNER_ID);
  const page = makePage({ ownerId: null, visibility: "private" });
  const ctx = buildCtx(page, makeRecordingStore([page]), []);
  assert.equal(findAction("share-with-workspace").enabled?.(ctx), false);
  clearAccessContext();
});

// --- Visibility actions run tests -------------------------------------------

test("make-private: run patches exactly { visibility } once and toasts success once", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "shared" });
  const store = makeRecordingStore([page]);
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx = buildCtx(page, store, toasts);
  findAction("make-private").run(ctx);
  assert.deepEqual(store.patches, [{ id: PAGE_ID, patch: { visibility: "private" } }]);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, "success");
  assert.ok(toasts[0].title.includes("is now private"));
});

test("share-with-workspace: run patches exactly { visibility } once and toasts success once", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const store = makeRecordingStore([page]);
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx = buildCtx(page, store, toasts);
  findAction("share-with-workspace").run(ctx);
  assert.deepEqual(store.patches, [{ id: PAGE_ID, patch: { visibility: "shared" } }]);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, "success");
  assert.ok(toasts[0].title.includes("is now shared with the workspace"));
});

test("make-private: refused patch (store keeps old visibility) -> one error toast, no success", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "shared" });
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx: MenuActionCtx = {
    page,
    isFolder: false,
    workspaceId: WORKSPACE_ID,
    jwt: "jwt",
    store: {
      getState: () => ({
        patchPage: () => { /* refuses: keeps old visibility */ },
        pageById: () => makePage({ ownerId: OWNER_ID, visibility: "shared" }),
      }),
    } as MenuActionCtx["store"],
    layout: { getState: () => ({}) } as MenuActionCtx["layout"],
    clipboard: { getState: () => ({}) } as MenuActionCtx["clipboard"],
    toast: (t: { kind: string; title: string }) => { toasts.push(t); },
    onRename: () => {},
    onDelete: () => {},
    workspacePages: () => [page],
  };
  findAction("make-private").run(ctx);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, "error");
  assert.ok(toasts[0].title.includes("Couldn't change who can see"));
});

test("share-with-workspace: refused patch -> one error toast, no success", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx: MenuActionCtx = {
    page,
    isFolder: false,
    workspaceId: WORKSPACE_ID,
    jwt: "jwt",
    store: {
      getState: () => ({
        patchPage: () => { /* refuses: keeps old visibility */ },
        pageById: () => makePage({ ownerId: OWNER_ID, visibility: "private" }),
      }),
    } as MenuActionCtx["store"],
    layout: { getState: () => ({}) } as MenuActionCtx["layout"],
    clipboard: { getState: () => ({}) } as MenuActionCtx["clipboard"],
    toast: (t: { kind: string; title: string }) => { toasts.push(t); },
    onRename: () => {},
    onDelete: () => {},
    workspacePages: () => [page],
  };
  findAction("share-with-workspace").run(ctx);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, "error");
  assert.ok(toasts[0].title.includes("Couldn't change who can see"));
});

test("make-private: page with child -> success toast includes sub-pages sentence", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "shared" });
  const child = makeChildPage();
  const store = makeRecordingStore([page, child]);
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx = buildCtx(page, store, toasts);
  findAction("make-private").run(ctx);
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].title.includes("Sub-pages keep their own visibility."));
});

test("share-with-workspace: page with child -> success toast includes sub-pages sentence", () => {
  const page = makePage({ ownerId: OWNER_ID, visibility: "private" });
  const child = makeChildPage();
  const store = makeRecordingStore([page, child]);
  const toasts: Array<{ kind: string; title: string }> = [];
  const ctx = buildCtx(page, store, toasts);
  findAction("share-with-workspace").run(ctx);
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].title.includes("Sub-pages keep their own visibility."));
});
