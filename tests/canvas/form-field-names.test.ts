// #293: Chrome's DevTools Issues panel reports "A form field element should have an id or
// name attribute" for every unnamed field, and the subject (III.2) fails an evaluation on any
// console warning or issue. Every form field written in JSX in the app and in its UI kit
// (packages/osionos-ui) carries an id or a name.
//
// Caveat: this reads JSX tags, not the rendered DOM. It misses a field whose name arrives
// only through a spread (`{...props}` is trusted to carry it), a dynamic tag
// (`const Tag = "input"; <Tag />`), a field created with document.createElement, and any
// wrapper component other than the kit's Input and Textarea. Those under-report, so a clean
// run here is necessary, not sufficient: the Playwright console smoke is the DOM-level check.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const FIELD_TAGS = new Set(["input", "select", "textarea", "Input", "Textarea"]);
const ROOTS = ["src/", "packages/osionos-ui/src/"].map((root) => new URL(`../../${root}`, import.meta.url));

/** `file:line <tag>` for every field tag in `source` with neither an id, a name nor a spread. */
function unnamedFields(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && FIELD_TAGS.has(node.tagName.getText(sourceFile))) {
      const attributes = node.attributes.properties;
      const named = attributes.some((attribute) =>
        ts.isJsxSpreadAttribute(attribute)
        || ["id", "name"].includes(attribute.name.getText(sourceFile)));
      if (!named) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        found.push(`${file}:${line} <${node.tagName.getText(sourceFile)}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

test("the scan flags an unnamed field and accepts id, name or a spread", () => {
  const source = [
    "<input value={a} />",
    "<select name=\"kind\" />",
    "<textarea id=\"notes\"></textarea>",
    "<Input {...props} />",
    "<Textarea rows={3} />",
  ].map((line) => `const x${line.length} = ${line};`).join("\n");
  assert.deepEqual(unnamedFields("sample.tsx", source), ["sample.tsx:1 <input>", "sample.tsx:5 <Textarea>"]);
});

test("every form field in the app and its UI kit has an id or a name", () => {
  const files = ROOTS.flatMap((root) => readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".tsx") && !entry.includes("node_modules"))
    .map((entry) => new URL(entry, root)));
  assert.ok(files.length > 100, `only ${files.length} .tsx files found: the scan is reading the wrong tree`);
  const unnamed = files.flatMap((file) => unnamedFields(file.pathname, readFileSync(file, "utf8")));
  assert.deepEqual(unnamed, [], `form fields without an id or a name:\n${unnamed.join("\n")}`);
});

// Chromium 149's Issues panel calls `autocomplete="nickname"` non-standard, although the HTML
// spec lists it (measured on the beta's Settings > Profile, 2026-11-04: one probe input, one more
// issue). Only measured tokens are listed here.
// Caveat: literal attribute values only; a token that arrives through a variable or a spread is
// not read, so this under-reports.
const CHROMIUM_UNKNOWN_AUTOCOMPLETE = new Set(["nickname"]);

test("no JSX field uses an autocomplete token Chromium reports as non-standard", () => {
  const files = ROOTS.flatMap((root) => readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".tsx") && !entry.includes("node_modules"))
    .map((entry) => new URL(entry, root)));
  const flagged = files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/autoComplete="([^"]+)"/g)]
    .filter((match) => match[1].split(/\s+/).some((token) => CHROMIUM_UNKNOWN_AUTOCOMPLETE.has(token)))
    .map((match) => `${file.pathname}: autoComplete="${match[1]}"`));
  assert.deepEqual(flagged, []);
});
