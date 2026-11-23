/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-writers-flag-on.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The other half of RD6/RD7 (groot ADR 0067 D′): a dev or test build with the tester's
// osio.layout.modes override keeps every TD18 writer and control working as on D.

import assert from "node:assert/strict";
import test from "node:test";

import { setLayoutModesOverride } from "./support/layout-modes-flag.ts";

const { createCreatePageFromTemplate } = await import("../../src/store/pageStore.actions.ts");
const { applyTemplateToActivePage } = await import("../../src/features/templates/model/applyFromPanel.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");
// After the imports: a module that sees `window` at load wires browser listeners node lacks.
setLayoutModesOverride("1");

test("a catalogue id creates one page", async () => {
  const created: unknown[][] = [];
  const store = {
    addPage: async (...args: unknown[]) => { created.push(args); return { _id: "new-1", workspaceId: "ws-1", title: String(args[1]) }; },
  };
  const create = createCreatePageFromTemplate((() => undefined) as never, () => store as never);
  const page = await create("tpl:job-search", "ws-1", "jwt", undefined, { open: false });
  assert.equal(page?._id, "new-1");
  assert.equal(created.length, 1);
  assert.equal(created[0]?.[1], "Job search");
});

test("applying to the open page runs: with no page open it says so", async () => {
  const toasts: Array<{ title?: string }> = [];
  useToastStore.setState({ push: (toast: { title?: string }) => void toasts.push(toast) } as never);
  await applyTemplateToActivePage("tpl:job-search", async () => "cancel");
  assert.deepEqual(toasts.map((toast) => toast.title), ["Open a page to apply a template."]);
});
