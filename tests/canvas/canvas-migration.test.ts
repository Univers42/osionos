/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvas-migration.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { LayoutCell, LayoutConfig } from "../../src/entities/block/model/types.ts";
import { gridConfigFromLegacy, migrate, migrateLayoutCells, unmigrate, unmigrateCanvasCells } from "../../src/features/block-editor/ui/canvas/model/migration.ts";

interface LegacyLayoutFixture {
  layoutConfig: Partial<LayoutConfig>;
  layoutCells: LayoutCell[];
}

const fixture = JSON.parse(readFileSync(new URL("../../src/__fixtures__/legacy-layout.json", import.meta.url), "utf8")) as LegacyLayoutFixture;

test("round-trips legacy layout cells through the v2 canvas model", () => {
  const canvasCells = migrateLayoutCells(fixture.layoutCells, fixture.layoutConfig);
  const legacyCells = unmigrateCanvasCells(canvasCells, gridConfigFromLegacy(fixture.layoutConfig));

  assert.deepEqual(legacyCells, fixture.layoutCells);
});

test("migrate and unmigrate stay pure at the cell boundary", () => {
  const gridConfig = gridConfigFromLegacy(fixture.layoutConfig);
  const source = structuredClone(fixture.layoutCells[1]);
  const migrated = migrate(source, gridConfig, 7);
  const unmigrated = unmigrate(migrated, gridConfig);

  assert.deepEqual(source, fixture.layoutCells[1]);
  assert.deepEqual(unmigrated, fixture.layoutCells[1]);
  assert.equal(Object.hasOwn(migrated, "colStart"), false);
  assert.equal(Object.hasOwn(migrated, "rowStart"), false);
  assert.equal(migrated.z, 7);
});
