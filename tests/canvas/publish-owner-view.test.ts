/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publish-owner-view.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #61: /p/:token has no properties to evaluate a visibility formula with, so a gated cell
// always hid there. A publish now carries the gated ids the owner's view shows, decided by
// the real engine against the page's own properties; the bridge copies those and no formula.

import assert from "node:assert/strict";
import test, { before } from "node:test";
import "./support/user-store-env.ts";
import { bootFormulaEngine } from "./support/formula-engine.ts";
import type { Block, LayoutCell } from "../../src/entities/block/model/types.ts";
import { shownGatedIds, toPropertyMap } from "../../src/entities/block/model/visibility.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { shownForPublish } = await import("../../src/features/share/publishedView.ts");

before(bootFormulaEngine);

const DONE = 'prop("Status") == "Done"';
const DRAFT = 'prop("Status") == "Draft"';
const para = (id: string, visibleWhen?: string, children?: Block[]): Block => ({ id, type: "paragraph", content: id, visibleWhen, children });
const cell = (id: string, visibilityFormula?: string, blocks: Block[] = []): LayoutCell =>
  ({ id, colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1, blocks, visibilityFormula });

const CONTENT: Block[] = [
  para("b-shown", DONE),
  para("b-hidden", DRAFT, [para("under-hidden", "true")]),
  { id: "t", type: "toggle", content: "", children: [para("nested-shown", "true"), para("nested-plain")] },
  { id: "L", type: "layout", content: "", layoutCells: [
    cell("c-shown", DONE, [para("in-cell-hidden", "false"), para("in-cell-shown", DONE)]),
    cell("c-hidden", DRAFT, [para("in-hidden-cell", "true")]),
    cell("c-plain"),
  ] },
];

test("lists the gated blocks and cells this view shows, at any depth, and nothing ungated", () => {
  const ids = shownGatedIds(CONTENT, toPropertyMap([{ key: "Status", value: "Done" }]));
  assert.deepEqual(ids, ["b-shown", "nested-shown", "c-shown", "in-cell-shown"]);
});

test("a gated item the properties hide is not listed, nor anything inside it", () => {
  const ids = shownGatedIds(CONTENT, toPropertyMap([{ key: "Status", value: "Draft" }]));
  assert.deepEqual(ids, ["b-hidden", "under-hidden", "nested-shown", "c-hidden", "in-hidden-cell"]);
});

function seed(content: Block[] | undefined) {
  const page = { _id: "p1", workspaceId: "w", ownerId: "u", title: "P", content, properties: [{ key: "Status", label: "Status", value: "Done" }] };
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeSession: () => ({ userId: "u", privateWorkspaces: [{ _id: "w", role: "owner", permissions: ["read", "update"] }], sharedWorkspaces: [] }) }),
  });
  usePageStore.setState({ ...derivePageState({ w: [page as never] }), pageRevisions: {} } as never);
}

test("a publish reads the page's content and properties from the store", async () => {
  seed(CONTENT);
  assert.deepEqual(await shownForPublish("p1"), ["b-shown", "nested-shown", "c-shown", "in-cell-shown"]);
});

test("a page whose content is not loaded publishes no gated content", async () => {
  seed(undefined);
  assert.deepEqual(await shownForPublish("p1"), []);
  assert.deepEqual(await shownForPublish("not-a-page"), []);
});
