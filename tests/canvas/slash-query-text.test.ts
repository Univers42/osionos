/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slash-query-text.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  filterFromText,
  isAnchorValid,
  pinAnchor,
  stripSlashQuery,
} from "../../src/features/slash-commands/model/slashQueryText.ts";

// slashMenuCatalog.tsx holds JSX: the canvas loader compiles it, so the
// catalog loads. The skip is the safety net of a loader that cannot.
async function loadParseSlashQuery() {
  try {
    const mod = await import("../../src/features/slash-commands/model/slashMenuCatalog.tsx");
    return mod.parseSlashQuery as (filter: string) => { command: string; arg: string };
  } catch {
    return null;
  }
}

test("/h1: anchor at the slash, filter h1, strip leaves nothing", () => {
  assert.equal(filterFromText("/h1", 0), "h1");
  assert.equal(stripSlashQuery("/h1", 0), "");
});

test("/color gray keeps its argument through parseSlashQuery", async (t) => {
  const filter = filterFromText("/color gray", 0);
  assert.equal(filter, "color gray");
  const parse = await loadParseSlashQuery();
  if (!parse) return t.skip("parseSlashQuery is not loadable under node");
  assert.deepEqual(parse(filter as string), { command: "color", arg: "gray" });
});

test("/whiteboard Q3/Q4 plan: the slash inside the argument does not move the query", async (t) => {
  const text = "/whiteboard Q3/Q4 plan";
  const filter = filterFromText(text, 0);
  assert.equal(filter, "whiteboard Q3/Q4 plan");
  assert.equal(stripSlashQuery(text, 0), "");
  assert.equal(stripSlashQuery(`intro ${text}`, 6), "intro ");
  const parse = await loadParseSlashQuery();
  if (!parse) return t.skip("parseSlashQuery is not loadable under node");
  assert.deepEqual(parse(filter as string), { command: "whiteboard", arg: "Q3/Q4 plan" });
});

test("text before the slash survives the strip", () => {
  assert.equal(filterFromText("hello /h1", 6), "h1");
  assert.equal(stripSlashQuery("hello /h1", 6), "hello ");
});

test("editing before the anchor invalidates it, so the menu closes", () => {
  assert.equal(isAnchorValid("hello /h1", 6), true);
  assert.equal(isAnchorValid("hellox /h1", 6), false);
  assert.equal(filterFromText("hellox /h1", 6), null);
  assert.equal(isAnchorValid("hell /h1", 6), false);
});

test("strip with an anchor that misses the stored content falls back to the last slash", () => {
  assert.equal(stripSlashQuery("hellox /h1", 6), "hellox ");
  assert.equal(stripSlashQuery("", 3), "");
});

test("Backspace over the slash makes the anchor invalid", () => {
  assert.equal(isAnchorValid("", 0), false);
  assert.equal(isAnchorValid("ab", 2), false);
  assert.equal(filterFromText("hello ", 6), null);
});

test("a pasted a/ opens nothing until pinned, and pins on its slash", () => {
  assert.equal(pinAnchor("a/"), 1);
  assert.equal(filterFromText("a/", 1), "");
  assert.equal(pinAnchor("none"), -1);
  assert.equal(isAnchorValid("none", -1), false);
});

test("a slash inside an earlier URL does not steal the anchor", () => {
  const text = "see http://x.y/ then /h1";
  const anchor = text.length - 3;
  assert.equal(text[anchor], "/");
  assert.equal(filterFromText(text, anchor), "h1");
  assert.equal(stripSlashQuery(text, anchor), "see http://x.y/ then ");
});

test("without an anchor, strip falls back to the last slash", () => {
  assert.equal(stripSlashQuery("a/b/c"), "a/b");
  assert.equal(stripSlashQuery("no slash"), "no slash");
});

// Scope: the whole of both directories; no legitimate non-slash lastIndexOf("/")
// existed there when this gate was written (checked with grep).
test("only slashQueryText.ts calls lastIndexOf with a slash in slash code", () => {
  const roots = ["src/features/slash-commands", "src/features/block-editor/model"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && name !== "slashQueryText.ts") {
        if (/lastIndexOf\(\s*["']\/["']\s*\)/.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, []);
});
