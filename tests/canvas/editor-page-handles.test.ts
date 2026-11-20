/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editor-page-handles.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { pageHandleFor, useEditorCommandBus, type EditorHandle } from "@/features/block-editor/model/editorCommandBus";

function fakeHandle(sourceKey = "page:p1"): EditorHandle {
  return {
    sourceKey,
    pageId: "p1",
    kind: "linear",
    getContent: () => [],
    updateContent: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    canUndo: () => false,
    canRedo: () => false,
    focusBlock: () => undefined,
    selectAll: () => undefined,
  };
}

test("a page-body handle is found by pageId", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  const h = fakeHandle();
  useEditorCommandBus.getState().registerPageHandle(h);
  assert.equal(pageHandleFor("p1"), h);
});

test("a cell handle is never registered", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  useEditorCommandBus.getState().registerPageHandle(fakeHandle("cell:p1:l1:c1"));
  assert.equal(pageHandleFor("p1"), null);
});

test("the active editor is not a page handle", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  useEditorCommandBus.getState().setActive(fakeHandle());
  assert.equal(pageHandleFor("p1"), null);
});

test("unregistering another handle object keeps the registered one", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  const h1 = fakeHandle();
  const h2 = fakeHandle();
  useEditorCommandBus.getState().registerPageHandle(h1);
  useEditorCommandBus.getState().unregisterPageHandle(h2);
  assert.equal(pageHandleFor("p1"), h1);
  useEditorCommandBus.getState().unregisterPageHandle(h1);
  assert.equal(pageHandleFor("p1"), null);
});

test("pageHandleFor on an unknown page is null", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  assert.equal(pageHandleFor("p1"), null);
});

test("one page in two panes: closing either pane keeps the other resolvable", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  const first = fakeHandle();
  const second = fakeHandle();
  const bus = useEditorCommandBus.getState();
  bus.registerPageHandle(first);
  bus.registerPageHandle(second);
  assert.equal(pageHandleFor("p1"), second);
  bus.unregisterPageHandle(second);
  assert.equal(pageHandleFor("p1"), first);
  bus.registerPageHandle(second);
  bus.unregisterPageHandle(first);
  assert.equal(pageHandleFor("p1"), second);
  bus.unregisterPageHandle(second);
  assert.equal(pageHandleFor("p1"), null);
});

test("re-registering the same handle does not duplicate it", () => {
  useEditorCommandBus.setState({ pageHandles: {}, active: null });
  const h = fakeHandle();
  useEditorCommandBus.getState().registerPageHandle(h);
  useEditorCommandBus.getState().registerPageHandle(h);
  useEditorCommandBus.getState().unregisterPageHandle(h);
  assert.equal(pageHandleFor("p1"), null);
});
