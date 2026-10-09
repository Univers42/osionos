// The graph_render graph reads its data through the bridge only (never the BaaS
// /query/v1 data plane), and only its graph_view block body touches legacy code, which
// it reaches through the build-time gate. Pure file checks, no browser.

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const ROOT = new URL("../../", import.meta.url).pathname;
const NEW_DIRS = ["src/features/graph-studio", "src/widgets/graph-studio-view"];

function filesUnder(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const FILES = NEW_DIRS.flatMap(filesUnder);

test("the new graph's sources exist (the checks below are not vacuous)", () => {
  expect(FILES).toEqual(expect.arrayContaining([
    "src/features/graph-studio/model/toIngestDoc.ts",
    "src/features/graph-studio/api/fetchBridgeGraph.ts",
    "src/widgets/graph-studio-view/GraphStudioView.tsx",
  ]));
});

test("C10: no file of the new graph names the /query/v1 data plane", () => {
  const offenders = FILES.filter((file) => fs.readFileSync(path.join(ROOT, file), "utf8").includes("/query/v1"));
  expect(offenders).toEqual([]);
});

test("the new graph imports legacy code only from its gated graph_view block body", () => {
  const legacy = /(?:from|import\()\s*["'][^"']*legacy-(?:second-brain|graph-explorer|graph-engine)[^"']*["']/;
  const importers = FILES.filter((file) => legacy.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
  expect(importers).toEqual(["src/widgets/graph-studio-view/GraphViewBlock.tsx"]);
});

test("the element is never told to remember (it would write unscoped localStorage)", () => {
  const offenders = FILES.filter((file) => /setAttribute\(\s*["']remember["']/.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
  expect(offenders).toEqual([]);
});
