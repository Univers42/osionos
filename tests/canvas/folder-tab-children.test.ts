/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   folder-tab-children.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { shallow } from "zustand/vanilla/shallow";

import type { PageEntry } from "../../src/store/usePageStore.ts";
import { selectFolderChildren } from "../../src/widgets/page-renderer/ui/folderTabView.helpers.ts";

const page = (id: string, extra: Partial<PageEntry> = {}): PageEntry =>
  ({ _id: id, title: id, workspaceId: "ws", ...extra }) as PageEntry;

const pages: PageEntry[] = [
  page("folder", { surface: "folder" }),
  page("a", { parentPageId: "folder" }),
  page("b", { parentPageId: "folder", surface: "folder" }),
  page("gone", { parentPageId: "folder", archivedAt: "2026-09-01T00:00:00Z" }),
  page("elsewhere", { parentPageId: "other" }),
];

// FolderTabView subscribes through useShallow. zustand v5 hands the selector straight to
// useSyncExternalStore, which calls it again after every commit: if two calls on the SAME
// store state are not shallow-equal, React re-renders forever and throws #185
// ("Maximum update depth exceeded") the moment a folder with any child is opened.
test("a folder's children selection is shallow-stable for an unchanged store", () => {
  const first = selectFolderChildren(pages, "folder");
  const second = selectFolderChildren(pages, "folder");
  assert.ok(shallow(first, second), "two selections of the same state must be shallow-equal");
});

test("lists only the folder's live children", () => {
  assert.deepEqual(selectFolderChildren(pages, "folder").map((p) => p._id), ["a", "b"]);
  assert.deepEqual(selectFolderChildren(pages, "nobody"), []);
});
