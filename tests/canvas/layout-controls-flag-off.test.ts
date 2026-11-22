/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-controls-flag-off.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// RD7 (groot ADR 0067 D′): with osio.layout.modes off no button offers a TD18 writer that
// would then do nothing: no region control, no Templates rail item, no catalogue card in the
// templates panel or the Templates database. Run as the live build: MODE production, env
// unset, a tester's override set before the modules load (they read the flag at load) and lost.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bakeBuildEnv, setLayoutModesOverride } from "./support/layout-modes-flag.ts";
import "./support/user-store-env.ts";

bakeBuildEnv({ MODE: "production" });
setLayoutModesOverride("1");

const { CellRegionControls } = await import("../../src/features/block-editor/ui/canvas/view/CellRegionControls.tsx");
const { RAIL_GROUPS } = await import("../../src/widgets/activity-rail/model/railItems.ts");
const { listEnabledCatalogue } = await import("../../src/features/templates/model/catalogueGate.ts");
const { getTemplatesDatabaseAdapter } = await import("../../src/widgets/database-view/model/templatesDatabaseState.ts");

const cell = { id: "c1", region: "left", stackAt: "tablet", sticky: true };

test("the inspector renders no region control", () => {
  const html = renderToStaticMarkup(React.createElement(CellRegionControls, { cell: cell as never, dispatch: () => undefined }));
  assert.equal(html, "");
});

test("the rail offers no Templates item", () => {
  const ids = RAIL_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  assert.equal(ids.includes("templates"), false);
  assert.ok(ids.includes("database"));
});

test("the templates panel and page shells get no catalogue card", async () => {
  assert.deepEqual(await listEnabledCatalogue(), []);
});

test("the Templates database lists no catalogue record", async () => {
  const pages = await getTemplatesDatabaseAdapter().findPages({});
  assert.equal(pages.filter((page) => page.id.startsWith("tpl:")).length, 0);
});
