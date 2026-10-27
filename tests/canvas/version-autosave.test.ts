/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   version-autosave.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { saveAutosaveVersion } = await import("../../src/entities/page/model/versionAutosave.ts");

type AddVersionArgs = Parameters<Parameters<typeof saveAutosaveVersion>[3]>;

const PAGE_ID = "11111111-1111-4111-8111-111111111111";

const page = (): PageEntry => ({
  _id: PAGE_ID,
  workspaceId: "workspace",
  title: "Shared page",
  visibility: "shared",
  ownerId: "author",
  content: [{ id: "text", type: "paragraph", content: "before" }],
  contentVersion: 4,
  updatedAt: "2026-10-21T00:00:00.000Z",
} as PageEntry);

function sessionAs(userId: string | null, role: string, permissions: string[]) {
  const session = userId && {
    userId,
    privateWorkspaces: [],
    sharedWorkspaces: [{ _id: "workspace", role, permissions }],
  };
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeSession: () => session || null }),
  });
}

function seed() {
  localStorage.clear();
  usePageStore.setState({ ...derivePageState({ workspace: [page()] }), pageRevisions: {} });
}

function fakeAddVersion(result: () => Promise<unknown> = () => Promise.resolve()) {
  const calls: AddVersionArgs[] = [];
  const addVersion = ((...args: AddVersionArgs) => {
    calls.push(args);
    return result();
  }) as Parameters<typeof saveAutosaveVersion>[3];
  return { addVersion, calls };
}

test("a viewer of a shared page writes no autosave version", () => {
  seed();
  sessionAs("viewer", "viewer", ["read"]);
  const { addVersion, calls } = fakeAddVersion();

  assert.equal(saveAutosaveVersion(PAGE_ID, "viewer", "Autosave 1", addVersion), false);
  assert.equal(calls.length, 0);
});

test("the owner saves the LATEST title and content, not the seeded ones", () => {
  seed();
  sessionAs("author", "editor", ["read", "update"]);
  const content = [{ id: "text", type: "paragraph" as const, content: "remote edit" }];
  usePageStore.getState().applyRemoteContent(PAGE_ID, content);
  const latest = usePageStore.getState().pageById(PAGE_ID)!;
  const { addVersion, calls } = fakeAddVersion();

  assert.equal(saveAutosaveVersion(PAGE_ID, "author", "Autosave 1", addVersion), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["author", PAGE_ID, { title: latest.title, content, label: "Autosave 1" }]);
});

test("an unknown page id writes nothing", () => {
  seed();
  sessionAs("author", "editor", ["read", "update"]);
  const { addVersion, calls } = fakeAddVersion();

  assert.equal(saveAutosaveVersion("missing", "author", "Autosave 1", addVersion), false);
  assert.equal(calls.length, 0);
});

test("no session writes nothing", () => {
  seed();
  sessionAs(null, "", []);
  const { addVersion, calls } = fakeAddVersion();

  assert.equal(saveAutosaveVersion(PAGE_ID, "author", "Autosave 1", addVersion), false);
  assert.equal(calls.length, 0);
});

test("a rejected addVersion still reports true and raises no unhandled rejection", async () => {
  seed();
  sessionAs("author", "editor", ["read", "update"]);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  const { addVersion, calls } = fakeAddVersion(() => Promise.reject(new Error("403")));

  assert.equal(saveAutosaveVersion(PAGE_ID, "author", "Autosave 1", addVersion), true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(calls.length, 1);
  assert.deepEqual(unhandled, []);
});
