/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   top-bar-editor-rows.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Edit and Selection menus drive the page editor of the ACTIVE TAB. The
// handle is resolved through pageHandleFor(activeTab.pageId), never through
// useEditorCommandBus.active (which is cleared only on unmount, so it can be
// stale). Real stores, fake editor handle.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import { copyBlocks } from "@/features/block-editor/model/blockClipboard";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { useEditorCommandBus, type EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import type { MenuAction, MenuItem } from "@/widgets/top-bar/model/menuTypes";
import { editMenu } from "@/widgets/top-bar/model/menus/editMenu";
import { selectionMenu } from "@/widgets/top-bar/model/menus/selectionMenu";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

const paragraph = (id: string): Block => ({ id, type: "paragraph", content: id });

interface Fake { handle: EditorHandle; calls: string[]; commits: Block[][]; canUndo: boolean }

function fakeHandle(content: Block[]): Fake {
  const fake: Fake = { calls: [], commits: [], canUndo: true } as Fake;
  fake.handle = {
    sourceKey: "page:p1", pageId: "p1", kind: "linear",
    getContent: () => content,
    updateContent: (next) => { fake.commits.push(next); },
    undo: () => { fake.calls.push("undo"); },
    redo: () => { fake.calls.push("redo"); },
    canUndo: () => fake.canUndo,
    canRedo: () => fake.canUndo,
    focusBlock: () => undefined,
    selectAll: () => { fake.calls.push("selectAll"); },
  };
  return fake;
}

function activate(fake: Fake | null, ids: string[] = []): void {
  useToastStore.getState().clear();
  useBlockSelection.getState().clearSelection();
  useEditorCommandBus.setState({ pageHandles: fake ? { p1: [fake.handle] } : {}, active: null });
  useWorkspaceLayout.setState({
    root: { type: "pane", id: "pane", activeTabId: "t1", tabs: [{ tabId: "t1", pageId: "p1", workspaceId: "w", kind: "page" }] },
    activePaneId: "pane",
  });
  if (ids.length > 0) useBlockSelection.getState().select("page:p1", "p1", ids);
}

const actions = (items: MenuItem[]): MenuAction[] => items.filter((item): item is MenuAction => "run" in item);
const edit = (id: string): MenuAction => {
  const row = actions(editMenu().items).find((item) => item.id === id);
  assert.ok(row, `Edit has ${id}`);
  return row;
};
const selection = (id: string): MenuAction => {
  const row = actions(selectionMenu().items).find((item) => item.id === id);
  assert.ok(row, `Selection has ${id}`);
  return row;
};
const disabled = (row: MenuAction): boolean => row.disabled?.() === true;

test("Edit lists its rows with only the accelerators that are bound", () => {
  assert.deepEqual(actions(editMenu().items).map((row) => [row.id, row.label, row.accelerator]), [
    ["edit.undo", "Undo", "Ctrl+Z"],
    ["edit.redo", "Redo", "Ctrl+Shift+Z"],
    ["edit.cut", "Cut", "Ctrl+X"],
    ["edit.copy", "Copy", "Ctrl+C"],
    ["edit.paste", "Paste", "Ctrl+V"],
    ["edit.paste-plain", "Paste without formatting", "Ctrl+Shift+V"],
    ["edit.duplicate", "Duplicate", "Ctrl+D"],
    ["edit.delete", "Delete", "Del"],
    ["edit.find", "Find pages…", "⌘K"],
    ["edit.command", "Run command…", "⌘⇧P"],
  ]);
});

test("Selection holds editor-only rows: Close pane and Close tab live in File alone", () => {
  assert.deepEqual(actions(selectionMenu().items).map((row) => [row.id, row.accelerator]), [
    ["sel.select-all", "Ctrl+A"],
    ["sel.move-up", "Ctrl+Shift+↑"],
    ["sel.move-down", "Ctrl+Shift+↓"],
    ["sel.split-right", "⌘\\"],
    ["sel.split-down", undefined],
  ]);
});

test("with no page editor in the active tab every block row is disabled and a stale bus handle is ignored", () => {
  activate(null);
  const stale = fakeHandle([paragraph("a")]);
  useEditorCommandBus.setState({ active: stale.handle });
  for (const id of ["edit.undo", "edit.redo", "edit.cut", "edit.copy", "edit.paste", "edit.paste-plain", "edit.duplicate", "edit.delete"]) {
    assert.equal(disabled(edit(id)), true, `${id} is disabled`);
    edit(id).run();
  }
  assert.equal(disabled(selection("sel.select-all")), true);
  selection("sel.select-all").run();
  assert.deepEqual(stale.calls, [], "run never reaches the stale handle");
  assert.deepEqual(stale.commits, []);
});

test("with an editor but no block selection only Cut, Copy, Duplicate and Delete are disabled", () => {
  activate(fakeHandle([paragraph("a")]));
  const off = actions(editMenu().items).filter(disabled).map((row) => row.id);
  assert.deepEqual(off, ["edit.cut", "edit.copy", "edit.duplicate", "edit.delete"]);
  activate(fakeHandle([paragraph("a")]), ["a"]);
  assert.deepEqual(actions(editMenu().items).filter(disabled).map((row) => row.id), []);
});

test("Undo uses the structural history, and falls back to the native undo when that history is empty", () => {
  const fake = fakeHandle([paragraph("a")]);
  const native: string[] = [];
  Reflect.set(globalThis, "document", { execCommand: (command: string) => { native.push(command); return true; } });
  activate(fake);
  assert.equal(disabled(edit("edit.undo")), false);
  edit("edit.undo").run();
  assert.deepEqual([fake.calls, native], [["undo"], []]);
  fake.canUndo = false;
  assert.equal(disabled(edit("edit.undo")), false, "an empty structural history is not a disabled row");
  edit("edit.undo").run();
  edit("edit.redo").run();
  assert.deepEqual([fake.calls, native], [["undo"], ["undo", "redo"]]);
});

test("only Undo and Redo ask for the editor back before they run", () => {
  activate(fakeHandle([paragraph("a")]), ["a"]);
  assert.deepEqual(actions(editMenu().items).filter((row) => row.refocusEditor).map((row) => row.id), ["edit.undo", "edit.redo"]);
});

test("Delete removes the selected block in one commit and clears the selection", () => {
  const fake = fakeHandle([paragraph("a"), paragraph("b")]);
  activate(fake, ["a"]);
  edit("edit.delete").run();
  assert.deepEqual(fake.commits.map((tree) => tree.map((block) => block.id)), [["b"]]);
  assert.deepEqual(useBlockSelection.getState().ids, []);
});

test("Duplicate commits one tree holding the copy and selects it", () => {
  const fake = fakeHandle([paragraph("a")]);
  activate(fake, ["a"]);
  edit("edit.duplicate").run();
  assert.equal(fake.commits.length, 1);
  assert.equal(fake.commits[0].length, 2);
  assert.notEqual(fake.commits[0][1].id, "a");
  assert.deepEqual(useBlockSelection.getState().ids, [fake.commits[0][1].id]);
});

test("Paste that cannot complete toasts instead of leaving an unhandled rejection", async () => {
  const fake = fakeHandle([paragraph("a")]);
  fake.handle.updateContent = () => { throw new Error("editor refused"); };
  copyBlocks([paragraph("a")], ["a"]);
  activate(fake);
  edit("edit.paste").run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(useToastStore.getState().toasts.map((toast) => toast.title), ["Paste isn't available here — use Ctrl+V"]);
});

test("Select all asks the editor to select every top-level block", () => {
  const fake = fakeHandle([paragraph("a")]);
  activate(fake);
  selection("sel.select-all").run();
  assert.deepEqual(fake.calls, ["selectAll"]);
});

test("Move block swaps with the neighbour for exactly one selected block and is disabled at the ends", () => {
  const fake = fakeHandle([paragraph("a"), paragraph("b"), paragraph("c")]);
  activate(fake, ["a"]);
  assert.equal(disabled(selection("sel.move-up")), true, "first block cannot go up");
  assert.equal(disabled(selection("sel.move-down")), false);
  selection("sel.move-up").run();
  assert.deepEqual(fake.commits, [], "a disabled move does not commit");
  selection("sel.move-down").run();
  assert.deepEqual(fake.commits.map((tree) => tree.map((block) => block.id)), [["b", "a", "c"]]);

  activate(fake, ["c"]);
  assert.equal(disabled(selection("sel.move-down")), true, "last block cannot go down");

  activate(fake, ["a", "b"]);
  assert.equal(disabled(selection("sel.move-down")), true, "two selected blocks do not move");
  activate(fake);
  assert.equal(disabled(selection("sel.move-down")), true, "no selected block does not move");
});
