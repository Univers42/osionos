/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   library-views-shape-parity.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge's Library view allowlist (scripts/bridge-library-views-shape.mjs) is a copy of
// the kit's lists. These keep the copy honest, and prove every view the app ships passes it,
// so an admin can always save the Library as it comes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as shape from "../../scripts/bridge-library-views-shape.mjs";
import { libraryViews } from "@/widgets/database-view/model/libraryViews";
import { LIBRARY_DB_ID } from "@/widgets/database-view/model/libraryDatabaseModel";

const KIT = "src/shared/notion-database-sys/packages/contract-types/src/index.ts";
// Views stay layout: what runs or embeds another surface is not shareable in a Library view.
const EXCLUDED_SETTINGS = ["automations", "widgets", "dashboardWidgets", "dashboardRows", "dashboardFilters", "formulaAnalytics", "relationAnalytics"];

// The kit source is read as text: node's strip-only TypeScript cannot load it (it has
// parameter properties).
const source = readFileSync(KIT, "utf8");

// Caveat: regexes over the source. A list is read as the quoted strings of
// `export const NAME = [ ... ] as const`, so a spread or a computed entry is missed. A
// ViewSettings key is a top-level `name?:` / `name:` at two-space indent, so a key declared
// on a wrapped line or via a spread type is missed. Either shows up as a mismatch, not a pass.
function kitList(name: string): string[] {
  const body = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(source)?.[1] ?? "";
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function viewSettingsKeys(): string[] {
  const body = /export interface ViewSettings \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
  return [...body.matchAll(/^ {2}([A-Za-z]\w*)\??:/gm)].map((match) => match[1]);
}

test("the database id and the view types match the kit (dashboard excluded)", () => {
  assert.equal(shape.LIBRARY_DB_ID, LIBRARY_DB_ID);
  assert.deepEqual(shape.VIEW_TYPES, kitList("VIEW_TYPES").filter((type) => type !== "dashboard"));
});

test("the filter operators are the kit's", () => {
  assert.deepEqual(shape.FILTER_OPERATORS, kitList("FILTER_OPERATORS"));
});

test("the settings keys are the kit's ViewSettings minus what runs", () => {
  const kit = viewSettingsKeys();
  assert.ok(kit.length > 50, `parsed ${kit.length} ViewSettings keys`);
  assert.deepEqual([...shape.SETTINGS_KEYS].sort(), kit.filter((key) => !EXCLUDED_SETTINGS.includes(key)).sort());
});

test("every Library view the app ships passes the bridge check", () => {
  const views = libraryViews(true);
  assert.deepEqual(shape.parseLibraryViews(views), views);
});
