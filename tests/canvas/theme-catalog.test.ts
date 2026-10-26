/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-catalog.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The catalog is the one list of what a theme may set. A token added to the
// stylesheets without being classified, or a catalog entry whose token is gone,
// fails here, so the catalog cannot drift from the CSS.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { TOKEN_KEY_RE } from "../../scripts/bridge-theme-rules.mjs";
import { EXCLUDED_TOKENS, THEME_TOKENS, themeToken } from "../../src/shared/config/themeTokens.ts";

const STYLES = new URL("../../src/app/styles/", import.meta.url).pathname;

function styleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return styleFiles(path);
    return /\.(css|scss)$/.test(entry.name) ? [path] : [];
  });
}

function definedTokens(): Set<string> {
  const keys = new Set<string>();
  for (const file of styleFiles(STYLES)) {
    let text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (file.endsWith(".scss")) text = text.replace(/\/\/.*$/gm, "");
    for (const match of text.matchAll(/--osio-([a-z0-9-]+)\s*:/g)) keys.add(match[1]);
  }
  return keys;
}

function expectedGroup(key: string, kind: string): string {
  if (kind === "color") return "colors";
  if (kind === "font" || /^(font-size|font-weight|line-height|letter-spacing)-/.test(key)) return "fonts";
  return "layout";
}

test("every defined token is either in the catalog or excluded by exactly one rule", () => {
  const catalog = new Set(THEME_TOKENS.map((token) => token.key));
  const unclassified: string[] = [];
  for (const key of definedTokens()) {
    const exclusions = EXCLUDED_TOKENS.filter((rule) => rule.pattern.test(key)).length;
    if (catalog.has(key) && exclusions > 0) unclassified.push(`${key} (both listed and excluded)`);
    else if (!catalog.has(key) && exclusions !== 1) unclassified.push(`${key} (${exclusions} exclusions)`);
  }
  assert.deepEqual(unclassified, []);
});

test("every catalog token is still defined in the stylesheets", () => {
  const defined = definedTokens();
  assert.deepEqual(THEME_TOKENS.filter((token) => !defined.has(token.key)).map((token) => token.key), []);
});

test("catalog keys are unique token names", () => {
  const keys = THEME_TOKENS.map((token) => token.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.ok(TOKEN_KEY_RE.test(key) && key.length <= 48, key);
});

test("each token sits in the group its kind decides", () => {
  for (const token of THEME_TOKENS) assert.equal(token.group, expectedGroup(token.key, token.kind), token.key);
});

test("every entry explains itself", () => {
  for (const token of THEME_TOKENS) {
    assert.ok(token.description.length >= 8 && token.description.length <= 90, `${token.key}: "${token.description}"`);
  }
  for (const rule of EXCLUDED_TOKENS) assert.ok(rule.reason.trim().length > 0, String(rule.pattern));
});

test("themeToken finds a key and nothing else", () => {
  assert.equal(themeToken("bg-page")?.kind, "color");
  assert.equal(themeToken("page-max-width")?.group, "layout");
  assert.equal(themeToken("n-1"), undefined);
});
