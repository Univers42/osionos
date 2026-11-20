/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogue-entry-graph.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENTRY = join(ROOT, "src/app/main.tsx");
const CATALOGUE = join(ROOT, "src/data/templates/catalogue");
const TPL_ID = join(CATALOGUE, "tplId.ts");
const STATIC_IMPORT = /\bimport\s*(?!\()\s*(?:[^;"'()]*?\bfrom\s*)?["']([^"']+)["']|\bexport\s*[^;"']*?\bfrom\s*["']([^"']+)["']/g;

function resolveModule(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(ROOT, "src", specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Caveat: regex walk — a specifier built at runtime or an import split across a template string is missed (under-report); the build-manifest half of TD22 is checked when the catalogue gains its first consumer (Task 8c).
function walkStatics(file: string, visited: Set<string>): void {
  if (visited.has(file)) return;
  visited.add(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(STATIC_IMPORT)) {
    const resolved = resolveModule(match[1] ?? match[2] ?? "", file);
    if (resolved) walkStatics(resolved, visited);
  }
}

test("TD22 regex accepts compact static syntax but ignores dynamic imports", () => {
  const source = [
    'import"./bare";', 'import{x}from"./named";', 'export{x}from"./reexport";',
    'import("./dynamic");', 'import ("./spaced-dynamic");',
  ].join("\n");
  const specifiers = Array.from(source.matchAll(STATIC_IMPORT), (match) => match[1] ?? match[2]);
  assert.deepEqual(specifiers, ["./bare", "./named", "./reexport"]);
});

test("TD22: the static app graph reaches only catalogue/tplId.ts", () => {
  const visited = new Set<string>();
  walkStatics(ENTRY, visited);
  assert.ok(visited.size > 200, `the walk must traverse the app, visited ${visited.size} files`);
  assert.ok(visited.has(TPL_ID), "the walk must reach catalogue/tplId.ts");
  const leaked = [...visited].filter((file) => file.startsWith(`${CATALOGUE}/`) && file !== TPL_ID);
  assert.deepEqual(leaked, [], "catalogue templates and their builders stay behind import()");
});
