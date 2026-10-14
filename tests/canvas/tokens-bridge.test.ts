// The vendored database ships its own colours, 259 --color-* names. The bridge
// maps every one of them onto a token of the app's palette. These tests hold
// that mapping to what makes it safe: nothing escapes it, it only points at
// tokens that exist, and the committed stylesheet is what the generator writes.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  BRIDGE_STYLESHEET,
  collectColorNames,
  renderBridge,
  VENDORED_THEME,
} from "../../scripts/tokens/databaseBridge.mjs";

const APP_ROOT = new URL("../../", import.meta.url);
const readAppFile = (path: string) => readFileSync(new URL(path, APP_ROOT), "utf8");

const vendoredCss = readAppFile(VENDORED_THEME);
const bridge = renderBridge(vendoredCss);

const declaredIn = (css: string) => new Set(Array.from(css.matchAll(/^\s*(--osio-[a-z0-9-]+)\s*:/gm), (m) => m[1]));

test("the vendored stylesheet still declares the colours the bridge was written for", () => {
  assert.ok(collectColorNames(vendoredCss).length >= 259);
});

test("every --color-* name in the vendored stylesheet is mapped", () => {
  assert.deepEqual(bridge.unmapped, []);
  const bridged = new Set(Array.from(bridge.css.matchAll(/^\s*(--color-[a-z0-9-]+)\s*:/gm), (m) => m[1]));
  assert.deepEqual(collectColorNames(vendoredCss).filter((name) => !bridged.has(name)), []);
});

test("every mapping points at a token the app defines", () => {
  const defined = new Set([
    ...declaredIn(readAppFile("src/app/styles/tokens.generated.css")),
    ...declaredIn(readAppFile("src/app/styles/global.css")),
    ...declaredIn(bridge.css),
  ]);
  const read = Array.from(bridge.css.matchAll(/var\((--osio-[a-z0-9-]+)\)/g), (m) => m[1]);
  assert.ok(read.length > 259);
  assert.deepEqual([...new Set(read)].filter((name) => !defined.has(name)), []);
});

test("a mapping never writes a colour literal", () => {
  const declarations = bridge.css.match(/^\s*--[a-z0-9-]+\s*:.*$/gm) ?? [];
  assert.deepEqual(declarations.filter((line) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(line)), []);
});

test("the committed bridge stylesheet is what the generator writes", () => {
  assert.equal(readAppFile(BRIDGE_STYLESHEET), bridge.css);
});

test("a colour the table does not know is reported, not dropped", () => {
  const synthetic = `${vendoredCss}\n.notion-object-database[data-theme="light"] { --color-brand-new: #123456; }`;
  assert.deepEqual(renderBridge(synthetic).unmapped, ["--color-brand-new"]);
});

test("the bridge owns the table and chart tokens, aliased to existing ones", () => {
  assert.match(bridge.css, /--osio-table-header-bg: var\(--osio-bg-subtle\);/);
  assert.match(bridge.css, /--osio-table-row-hover: var\(--osio-bg-hover\);/);
  assert.match(bridge.css, /--osio-table-border: var\(--osio-db-line\);/);
  assert.match(bridge.css, /--osio-chart-1: var\(--osio-accent\);/);
  assert.match(bridge.css, /--osio-chart-10: var\(--osio-block-tint-gray-fg\);/);
});

// The table's focused cell and fill range paint the "success" ring and the emerald wash; selection is the
// accent in this design, so those names follow it, while the green "done" badges (-surface-muted, -text-tag) stay green.
test("the table's cell cursor follows the accent, and green stays on the success badges", () => {
  const value = (name: string) => bridge.css.match(new RegExp(`--color-${name}: (.*);`))?.[1];
  assert.match(value("ring-success") ?? "", /var\(--osio-accent\) 80%/);
  assert.match(value("ring-success-soft") ?? "", /var\(--osio-accent\) 50%/);
  assert.match(value("inset-success") ?? "", /var\(--osio-accent\) 50%/);
  assert.match(value("emerald") ?? "", /^var\(--osio-accent\)$/);
  assert.match(value("emerald-surface") ?? "", /var\(--osio-accent\)/);
  assert.match(value("emerald-surface2") ?? "", /var\(--osio-accent\)/);
  assert.match(value("emerald-surface-muted") ?? "", /block-tint-green/);
  assert.match(value("emerald-text-tag") ?? "", /block-tint-green/);
});

type Specificity = [number, number, number];

/** (ids, classes + attributes + pseudo-classes, types) of one compound selector chain. */
function specificity(selector: string): Specificity {
  const stripped = selector.replace(/\[[^\]]*\]/g, "[]");
  const ids = (stripped.match(/#[\w-]+/g) ?? []).length;
  const classes = (stripped.match(/\.[\w-]+|\[\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (stripped.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, classes, types];
}

const beats = (a: Specificity, b: Specificity) => {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

const selectorsOf = (css: string) =>
  Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|\})\s*([^{}]+)\{/g), (m) => m[1])
    .flatMap((list) => list.split(",").map((part) => part.trim()))
    .filter(Boolean);

test("the bridge wins over the vendored blocks by specificity, not by load order", () => {
  const strongestVendored = selectorsOf(vendoredCss).map(specificity).reduce((a, b) => (beats(b, a) ? b : a));
  const colourBlock = bridge.css.slice(bridge.css.indexOf("html:root"));
  const bridged = selectorsOf(colourBlock);
  assert.ok(bridged.length >= 3);
  for (const selector of bridged) {
    assert.ok(beats(specificity(selector), strongestVendored), `${selector} does not beat the vendored ${strongestVendored}`);
  }
});

test("the bridge reaches the page root and the database roots", () => {
  assert.match(bridge.css, /html:root\[data-theme\]/);
  assert.match(bridge.css, /\.notion-object-database/);
  assert.match(bridge.css, /\[data-dbms-source\]/);
});

// Nothing outside the database reads what the bridge defines (--color-* and the --osio-table-* / --osio-chart-*
// tokens: grep over src, packages and the legacy graph engine, 2026-10-14), so it ships with the code that
// renders a database instead of in the render-blocking entry CSS (the bridge was 2.3 KB gzip of it).
const BRIDGE_IMPORTS = ["database-bridge.generated.css", "database-overrides.css"];
const DATABASE_RENDERERS = [
  "src/widgets/database-view/ui/DatabaseBlock.tsx",
  "src/widgets/database-view/ui/WorkspaceDatabaseBlock.tsx",
  "src/features/settings/people/PeopleDatabasePanel.tsx",
];

test("the entry stylesheet leaves the bridge to the database chunk", () => {
  const entry = readAppFile("src/app/styles/global.css");
  for (const file of BRIDGE_IMPORTS) assert.doesNotMatch(entry, new RegExp(`@import\\s+"[^"]*${file.replace(/\./g, "\\.")}"`), `global.css still imports ${file}`);
});

test("every component that renders ObjectDatabase imports the bridge with it", () => {
  for (const path of DATABASE_RENDERERS) {
    const source = readAppFile(path);
    assert.match(source, /<ObjectDatabase\b/, `${path} no longer renders ObjectDatabase`);
    for (const file of BRIDGE_IMPORTS) assert.match(source, new RegExp(`import ["']@/app/styles/${file.replace(/\./g, "\\.")}["']`), `${path} does not import ${file}`);
  }
});

test("no other component renders ObjectDatabase without the bridge", () => {
  const renderers = readdirSync(new URL("src", APP_ROOT), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".tsx") && !path.startsWith("shared/notion-database-sys/"))
    .map((path) => `src/${path}`)
    .filter((path) => readAppFile(path).includes("<ObjectDatabase"));
  assert.deepEqual(renderers.sort(), [...DATABASE_RENDERERS].sort());
});

test("the entry stylesheet does not compile the vendored database's utilities a second time", () => {
  assert.match(readAppFile("src/app/styles/global.css"), /^@source not "\.\.\/\.\.\/shared\/notion-database-sys";$/m);
});
