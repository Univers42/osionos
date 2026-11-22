/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-controls-flag-on.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The other half of RD7 (groot ADR 0067 D′): a dev or test build with the tester's
// osio.layout.modes override shows every TD18 control as on D. The override is set before
// the modules load, since the rail and the layout-modes context read the flag at load.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setLayoutModesOverride } from "./support/layout-modes-flag.ts";
import "./support/user-store-env.ts";

setLayoutModesOverride("1");

const { CellRegionControls } = await import("../../src/features/block-editor/ui/canvas/view/CellRegionControls.tsx");
const { RAIL_GROUPS } = await import("../../src/widgets/activity-rail/model/railItems.ts");
const { listEnabledCatalogue } = await import("../../src/features/templates/model/catalogueGate.ts");
const { getTemplatesDatabaseAdapter } = await import("../../src/widgets/database-view/model/templatesDatabaseState.ts");

const cell = { id: "c1", region: "left", stackAt: "tablet", sticky: true };

test("the inspector renders the region, collapse and stick controls", () => {
  const html = renderToStaticMarkup(React.createElement(CellRegionControls, { cell: cell as never, dispatch: () => undefined }));
  for (const label of ["Region", "Collapse below", "Stick while scrolling"]) assert.ok(html.includes(label), label);
});

test("the rail offers the Templates item", () => {
  const ids = RAIL_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  assert.ok(ids.includes("templates"));
});

test("the templates panel gets the catalogue", async () => {
  const cards = await listEnabledCatalogue();
  assert.ok(cards.some((card) => card.id === "tpl:job-search"));
});

test("the Templates database lists shipped records", async () => {
  const pages = await getTemplatesDatabaseAdapter().findPages({});
  assert.ok(pages.some((page) => page.id.startsWith("tpl:")));
});
