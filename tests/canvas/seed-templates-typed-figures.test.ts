/* ************************************************************************** */
/*  seed-templates-typed-figures.test.ts — no template ships a fake metric    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SEED_PAGES } from "@/data/seedPages";

// A heading that is only a figure ("3.7", "86", "15") is a metric somebody typed in:
// no database backs it, so it goes stale the first time a row changes.
const BARE_FIGURE = /^[\d.,%\s]+$/;

function headingTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) headingTexts(item, out);
  } else if (node && typeof node === "object") {
    const block = node as { type?: unknown; content?: unknown };
    if (typeof block.type === "string" && /^heading|^h\d$/.test(block.type) && typeof block.content === "string") {
      out.push(block.content);
    }
    for (const value of Object.values(node)) if (typeof value === "object") headingTexts(value, out);
  }
  return out;
}

test("no template heading is a typed-in figure", () => {
  const templates = SEED_PAGES.filter(page => page.isTemplate);
  assert.ok(templates.length > 0);
  const fakes = templates.flatMap(page =>
    headingTexts(page.content).filter(text => BARE_FIGURE.test(text.trim())).map(text => `${page.title}: ${text}`));
  assert.deepEqual(fakes, []);
});
