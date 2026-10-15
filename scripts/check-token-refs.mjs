#!/usr/bin/env node
// Fails when the app reads a --osio-* token that nothing defines. Such a read
// resolves to an empty value: the element silently loses its colour or font.
// (Found this way: --osio-font-mono, --osio-shadow-md and six more.)
//
// Ponytail: "defined" means declared anywhere, under any selector. A token
// declared only inside a scope that does not contain its reader still passes
// (--osio-code-* inside .osio-code-card was read by the IDE shell outside it).
// Comment stripping is line-based for TS: a `//` inside a string on a line that
// starts with code is kept, so a token named there is still counted.
// Names built at runtime (`--osio-tint-${hue}`) are not seen at all.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "packages", "index.html"];
const SKIPPED = ["src/shared/notion-database-sys/", "/node_modules/", "packages/osionos-ui/tokens.css"];
const READ = /\.(tsx?|css|scss|html)$/;

const DEFINED_IN_CSS = /(--osio-[a-z0-9-]+)\s*:/g;
const DEFINED_IN_CODE = /["'`](--osio-[a-z0-9-]+)["'`]\]?\s*:|setProperty\(\s*["'`](--osio-[a-z0-9-]+)["'`]/g;
const READ_BY_VAR = /var\(\s*(--osio-[a-z0-9-]+)\s*\)/g;
const READ_BY_SCRIPT = /getPropertyValue\(\s*["'`](--osio-[a-z0-9-]+)["'`]/g;

const isStyleSheet = (path) => /\.(css|scss)$/.test(path);

/** Blanks comments but keeps every newline, so line numbers stay true. */
function withoutComments(path, text) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (isStyleSheet(path)) return noBlocks;
  return noBlocks.replace(/^[ \t]*\/\/.*$/gm, blank);
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** @param {{path: string, text: string}[]} sources */
export function findUndefinedTokenRefs(sources) {
  const cleaned = sources.map(({ path, text }) => ({ path, text: withoutComments(path, text) }));
  const defined = new Set();
  for (const { path, text } of cleaned) {
    const pattern = isStyleSheet(path) ? DEFINED_IN_CSS : DEFINED_IN_CODE;
    for (const match of text.matchAll(pattern)) defined.add(match[1] ?? match[2]);
  }
  const undefinedRefs = [];
  for (const { path, text } of cleaned) {
    for (const pattern of [READ_BY_VAR, READ_BY_SCRIPT]) {
      for (const match of text.matchAll(pattern)) {
        if (!defined.has(match[1])) undefinedRefs.push({ token: match[1], path, line: lineOf(text, match.index) });
      }
    }
  }
  return undefinedRefs.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** Every stylesheet, script and HTML file the app ships, as {path, text}. */
export function collectSources(appRoot) {
  const files = [];
  for (const root of ROOTS) {
    const start = join(appRoot, root);
    const entries = READ.test(root) ? [""] : readdirSync(start, { recursive: true });
    for (const entry of entries) {
      const path = relative(appRoot, join(start, entry));
      if (!READ.test(path) || SKIPPED.some((skipped) => path.includes(skipped))) continue;
      files.push({ path, text: readFileSync(join(appRoot, path), "utf8") });
    }
  }
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refs = findUndefinedTokenRefs(collectSources(process.cwd()));
  for (const ref of refs) console.error(`${ref.path}:${ref.line}  ${ref.token} is read but never defined`);
  if (refs.length > 0) process.exit(1);
  console.log("✓ token references resolve: every --osio-* token the app reads is defined.");
}
