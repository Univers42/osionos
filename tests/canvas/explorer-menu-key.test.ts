/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer-menu-key.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { explorerKeyAction } from "../../src/features/ide/model/explorerKeys.ts";
import type { VisibleItem } from "../../src/features/ide/model/explorerRows.ts";

function makeItem(rel: string, kind: "dir" | "page" | "code" = "page", level = 1): VisibleItem {
  return {
    rel,
    row: { name: rel, kind, label: rel },
    parentRel: "",
    level,
    setSize: 1,
    posInSet: 1,
  };
}

test("explorerKeyAction: ContextMenu on a row returns menu action", () => {
  const visible = [makeItem("a.omd"), makeItem("b.omd")];
  const action = explorerKeyAction("ContextMenu", visible, "a.omd", new Set());
  assert.deepEqual(action, { type: "menu", rel: "a.omd" });
});

test("explorerKeyAction: ContextMenu on an empty list returns null", () => {
  const visible: VisibleItem[] = [];
  const action = explorerKeyAction("ContextMenu", visible, "a.omd", new Set());
  assert.equal(action, null);
});

test("explorerKeyAction: ContextMenu on non-current row returns null", () => {
  const visible = [makeItem("a.omd"), makeItem("b.omd")];
  const action = explorerKeyAction("ContextMenu", visible, "c.omd", new Set());
  assert.equal(action, null);
});

test("explorerKeyAction: other keys unchanged", () => {
  const visible = [makeItem("a.omd"), makeItem("b.omd")];
  assert.deepEqual(explorerKeyAction("ArrowDown", visible, "a.omd", new Set()), { type: "focus", rel: "b.omd" });
  assert.deepEqual(explorerKeyAction("Enter", visible, "a.omd", new Set()), { type: "activate", rel: "a.omd" });
  assert.deepEqual(explorerKeyAction("F2", visible, "a.omd", new Set()), { type: "rename", rel: "a.omd" });
  assert.deepEqual(explorerKeyAction("Delete", visible, "a.omd", new Set()), { type: "delete", rel: "a.omd" });
});