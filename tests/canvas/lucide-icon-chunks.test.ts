/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lucide-icon-chunks.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STATIC_ICON_CHUNK,
  lucideBarrelIcons,
  lucideIconChunks,
  lucideNamesUsedBy,
} from "../../scripts/vite/lucideIconChunks.ts";

// Hand-built ESTree statements, shaped like Rollup's parser output.
const id = (name: string) => ({ type: "Identifier", name });
const literal = (value: string) => ({ type: "Literal", value });
const importFrom = (source: string, names: [string, string][]) => ({
  type: "ImportDeclaration",
  source: literal(source),
  specifiers: names.map(([imported, local]) => ({ type: "ImportSpecifier", imported: id(imported), local: id(local) })),
});
const exportFrom = (source: string, names: [string, string][]) => ({
  type: "ExportNamedDeclaration",
  source: literal(source),
  specifiers: names.map(([local, exported]) => ({ type: "ExportSpecifier", local: id(local), exported: id(exported) })),
});

const BARREL = [
  exportFrom("./icons/chevron-right.js", [["default", "ChevronRight"], ["default", "ChevronRightIcon"]]),
  exportFrom("./icons/square-pen.js", [["default", "SquarePen"], ["default", "Edit"]]),
  exportFrom("./icons/plus.js", [["default", "Plus"]]),
  exportFrom("./Icon.js", [["default", "Icon"]]),
];
const ICONS_DIR = "/app/node_modules/.pnpm/lucide-react@0.546.0/node_modules/lucide-react/dist/esm";

test("names imported or re-exported from lucide-react, under the imported name", () => {
  const body = [
    importFrom("lucide-react", [["Plus", "Plus"], ["X", "Close"]]),
    importFrom("react", [["useState", "useState"]]),
    exportFrom("lucide-react", [["Check", "Check"]]),
  ];
  assert.deepEqual(lucideNamesUsedBy(body), ["Plus", "X", "Check"]);
});

test("the barrel maps every alias to its icon file and skips non-icon exports", () => {
  const icons = lucideBarrelIcons(BARREL);
  assert.equal(icons.get("ChevronRightIcon"), "chevron-right");
  assert.equal(icons.get("Edit"), "square-pen");
  assert.equal(icons.has("Icon"), false);
});

test("an icon used by name goes to the static chunk, the rest stay in stable buckets", () => {
  const { plugin, chunkOf } = lucideIconChunks();
  const parsed = plugin.moduleParsed as (info: { id: string; ast: { body: unknown[] } }) => void;
  parsed({ id: `${ICONS_DIR}/lucide-react.js`, ast: { body: BARREL } });
  parsed({ id: "/app/src/widgets/Toolbar.tsx", ast: { body: [importFrom("lucide-react", [["Edit", "Pencil"]])] } });
  assert.equal(chunkOf(`${ICONS_DIR}/icons/square-pen.js`), STATIC_ICON_CHUNK);
  const bucket = chunkOf(`${ICONS_DIR}/icons/plus.js`);
  assert.match(bucket ?? "", /^vendor-lucide-\d+$/);
  assert.equal(chunkOf(`${ICONS_DIR}/icons/plus.js`), bucket);
});

test("the icon runtime sits with the eager static icons; lazy entry points follow the graph", () => {
  const { chunkOf } = lucideIconChunks();
  for (const file of ["Icon.js", "createLucideIcon.js", "defaultAttributes.js", "shared/src/utils.js"]) {
    assert.equal(chunkOf(`${ICONS_DIR}/${file}`), STATIC_ICON_CHUNK, file);
  }
  for (const file of ["lucide-react.js", "dynamicIconImports.js", "DynamicIcon.js"]) {
    assert.equal(chunkOf(`${ICONS_DIR}/${file}`), undefined, file);
  }
});
