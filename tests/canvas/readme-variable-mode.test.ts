// U7c (groot ADR 0059, MC-1..MC-7): a profile README never resolves `{{…}}` in the viewer's
// scope. Rendered for real with react-dom/server: ReadmeBlocks vs PageBlocksRenderer, with
// the viewer's own env.json holding the values that must not show.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { startVariablesSync } = await import("../../src/features/variables/model/variablesSync.ts");
const { useVariablesStore } = await import("../../src/features/variables/model/useVariablesStore.ts");
const { ReadmeBlocks } = await import("../../src/widgets/profile-page/ReadmeBlocks.tsx");
const { PageBlocksRenderer } = await import("../../src/widgets/page-renderer/ui/PageBlocksRenderer.tsx");

Reflect.set(globalThis, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: "me", privateWorkspaces: [{ _id: "w", role: "owner", permissions: ["read", "update"] }], sharedWorkspaces: [] }) }),
});

const SECRET = "viewer-secret-42";
const PAGE_TITLE = "My private page";
const SOURCES = ["{{X}}", "{{PAGE}}"];
const EXPRS = "{{X}} {{PAGE}}";
const block = (id: string, type: string, extra: object = {}) => ({ id, type, content: "", ...extra });
const BLOCKS = [
  block("p", "paragraph", { content: `para ${EXPRS}` }),
  block("t", "table_block", { tableData: [[`cell ${EXPRS}`, "b"], ["c", "d"]] }),
  block("c", "callout", { content: `call ${EXPRS}` }),
  block("m", "image", { content: `cap ${EXPRS}`, url: "https://example.test/a.png" }),
] as never;

let stop: () => void = () => {};
function setEnv(x: string) {
  const env = { _id: "env", workspaceId: "w", ownerId: "me", title: "env.json", surface: "code", parentPageId: null, content: [{ id: "e", type: "code", content: JSON.stringify({ X: x }) }] };
  const mine = { _id: "mine", workspaceId: "w", ownerId: "me", title: PAGE_TITLE, parentPageId: null, content: [] };
  usePageStore.setState({ ...derivePageState({ w: [env, mine] as never }, usePageStore.getState() as never), pageRevisions: {}, activePage: { id: "mine", workspaceId: "w" } } as never);
}
beforeEach(() => {
  stop();
  useVariablesStore.setState({ byWorkspace: {}, version: 0 });
  setEnv(SECRET);
  stop = startVariablesSync();
});

after(() => stop());

const readme = (blocks = BLOCKS) => renderToStaticMarkup(React.createElement(ReadmeBlocks, { readme: { pageId: "r", blocks }, record: null }));
const ownPage = (blocks = BLOCKS) => renderToStaticMarkup(React.createElement(PageBlocksRenderer, { blocks }));
const sections = (html: string) => ["para", "cell", "call", "cap"].map((k) => html.split(`${k} `)[1]?.slice(0, 160) ?? "");

test("MC-1: a README shows {{…}} literal in a paragraph, a table, a callout and a media caption", () => {
  const html = readme();
  assert.ok(!html.includes(SECRET) && !html.includes(PAGE_TITLE), "no viewer value anywhere");
  for (const part of sections(html)) for (const src of SOURCES) assert.ok(part.includes(src), `${src} literal in: ${part}`);
});

// A paragraph only: it is the one block that goes through inlineMarkdownCache, so a stale
// hit cannot hide behind the table, callout and caption that resolve on their own.
test("MC-2: own page resolves, then the README is literal, then own page resolves again", () => {
  const paragraph = [BLOCKS[0]] as never;
  assert.ok(ownPage(paragraph).includes(SECRET), "own page, first render");
  assert.ok(!readme(paragraph).includes(SECRET), "README after a resolved render of the same content");
  assert.ok(ownPage(paragraph).includes(SECRET), "own page after the README");
});

test("MC-4: a resolved value is text, not markup: no element, no bold", () => {
  stop();
  useVariablesStore.setState({ byWorkspace: {}, version: 0 });
  setEnv("<img src=x onerror=alert(1)> **b**");
  stop = startVariablesSync();
  const html = ownPage();
  assert.ok(html.includes("&lt;img") && html.includes("**b**"), html);
  assert.ok(!/<img[^>]*onerror|<strong>b|<b>b/.test(html), "no injected element or bold");
  assert.equal(html.split("&lt;img").length - 1, 4, "escaped in all four call sites");
});

test("MC-5: the session user owns the env.json and the page, and the README still shows none of it", () => {
  const html = readme();
  assert.ok(!html.includes(SECRET) && !html.includes(PAGE_TITLE));
  assert.ok(html.includes("{{X}}"));
});

test("MC-7: on my own page {{…}} still resolves in all four read-only blocks", () => {
  const html = ownPage();
  assert.equal(html.split(SECRET).length - 1, 4, html);
  assert.equal(html.split(PAGE_TITLE).length - 1, 4);
});

test("MC-5/6: every README call site is ReadmeBlocks, and the profile widget names no resolver", () => {
  const dir = join(import.meta.dirname, "../../src/widgets/profile-page");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f));
  const offenders = files.filter((f) => /renderVariableChip|resolveVariableInActivePage/.test(readFileSync(join(dir, f), "utf8")));
  assert.deepEqual(offenders, []);
  const readmeUses = files.filter((f) => /<ReadmeBlocks\b/.test(readFileSync(join(dir, f), "utf8")));
  assert.deepEqual(readmeUses.sort(), ["ProfilePageView.tsx", "ProfileView.tsx"]);
  // Owner and viewer take the same path: ReadmeBlocks has no input that tells them apart.
  const source = readFileSync(join(dir, "ReadmeBlocks.tsx"), "utf8");
  assert.match(source, /React\.FC<\{ readme: [^;]*; record: [^;]*\}>/);
  assert.ok(!/owner|session|userId/i.test(source), "no owner/viewer input in ReadmeBlocks");
});
