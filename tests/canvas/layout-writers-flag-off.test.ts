/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-writers-flag-off.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// RD6 (groot ADR 0067 D′): with osio.layout.modes off, the TD18 writers refuse at their
// shared roots, not only behind hidden buttons. Run as the live build is: MODE production,
// env unset, while a tester's URL + localStorage override says "1" and must lose.

import assert from "node:assert/strict";
import test from "node:test";

import { bakeBuildEnv, setLayoutModesOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({ MODE: "production" });

const { canvasReducer } = await import("../../src/features/block-editor/ui/canvas/model/canvasReducer.ts");
const { createCanvasStateFromLegacy } = await import("../../src/features/block-editor/ui/canvas/model/migration.ts");
const { createCreatePageFromTemplate } = await import("../../src/store/pageStore.actions.ts");
const { applyTemplateToActivePage } = await import("../../src/features/templates/model/applyFromPanel.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");
// After the imports: a module that sees `window` at load wires browser listeners node lacks.
setLayoutModesOverride("1");

const regionCell = { id: "cell", colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 1, blocks: [], region: "left", stackAt: "mobile", sticky: true };
const userTemplate = { _id: "user-tpl", title: "Mine", workspaceId: "ws-1", isTemplate: true, content: [{ id: "b1", type: "paragraph", content: "hi" }] };

/** A page store reduced to what createPageFromTemplate reads; `created` counts addPage calls. */
function fakeStore() {
  const created: unknown[][] = [];
  const store = {
    fetchPageContent: async () => undefined,
    pageById: (id: string) => (id === userTemplate._id ? userTemplate : undefined),
    addPage: async (...args: unknown[]) => { created.push(args); return { _id: `new-${created.length}`, workspaceId: "ws-1", title: "x" }; },
  };
  return { created, createPageFromTemplate: createCreatePageFromTemplate((() => undefined) as never, () => store as never) };
}

test("a setCellRegion dispatch leaves the cell deep-equal and the state unchanged", () => {
  const state = createCanvasStateFromLegacy("layout", { columns: 12, rowHeight: 96, gap: 16 }, [regionCell as never]);
  const next = canvasReducer(state, { type: "setCellRegion", id: "cell", region: "main", stackAt: "never", sticky: false });
  assert.equal(next, state);
  assert.deepEqual(next.cells, state.cells);
});

test("a catalogue id creates no page and resolves null", async () => {
  const { created, createPageFromTemplate } = fakeStore();
  assert.equal(await createPageFromTemplate("tpl:job-search", "ws-1", "jwt", undefined, { open: false }), null);
  assert.equal(created.length, 0);
});

test("a user template still creates exactly one page (T parity)", async () => {
  const { created, createPageFromTemplate } = fakeStore();
  const page = await createPageFromTemplate(userTemplate._id, "ws-1", "jwt", undefined, { open: false });
  assert.equal(page?._id, "new-1");
  assert.equal(created.length, 1);
});

test("applying a catalogue template to the open page stops before anything runs", async () => {
  const toasts: unknown[] = [];
  useToastStore.setState({ push: (toast: unknown) => void toasts.push(toast) } as never);
  let asked = 0;
  await applyTemplateToActivePage("tpl:job-search", async () => { asked += 1; return "replace"; });
  assert.equal(asked, 0);
  assert.deepEqual(toasts, []);
});
