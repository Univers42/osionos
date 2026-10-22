/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-sections.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The settings tab is driven by ONE registry (model/sections.ts): navigation,
// search, titles and panel loading all read it. These checks hold its two
// invariants that outlive any refactor: the 19 legacy section ids stay put
// (saved links + menus.ts callers keep their meaning) and the anchor data that
// moved here from @osionos-ui keeps its scoring, so search results do not shift.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  findSection,
  searchSettings,
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
} from "@/features/settings/model/sections";

const SRC_ROOT = "src";

function srcFiles(base = SRC_ROOT): string[] {
  const entries = readdirSync(new URL(`../../${base}`, import.meta.url));
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${base}/${entry}`;
    const stats = statSync(new URL(`../../${path}`, import.meta.url));
    if (stats.isDirectory()) files.push(...srcFiles(path));
    else if (/\.(tsx?)$/.test(entry) && !entry.includes(".generated.")) files.push(path);
  }
  return files;
}

test("the registry lists exactly the 19 legacy section ids, the 2 AI ones and moderation, all unique", () => {
  const ids = SETTINGS_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length, "a section id appears twice");
  const LEGACY_IDS = [
    "profile", "preferences", "notifications", "connections", "contacts",
    "mail_calendar", "general", "people", "import", "page_settings",
    "shortcuts", "ai", "mcp", "public_pages", "library",
    "teamspaces", "permissions", "billing", "plans",
    // feat/ai: the AI connections tab and the accessibility & voice tab of the retired modal.
    "ai_connections", "accessibility_voice",
  ];
  for (const id of LEGACY_IDS) assert.ok(ids.includes(id), `${id} left the registry`);
  assert.equal(ids.length, LEGACY_IDS.length + 1);
  assert.ok(ids.includes("moderation"), "moderation missing from registry");
});

test("every section points at an existing group, and no group is empty", () => {
  const groupIds = new Set(SETTINGS_GROUPS.map((group) => group.id));
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(groupIds.has(section.group), `${section.id} points at the unknown group ${section.group}`);
    assert.ok(section.label.trim() && section.title.trim() && section.subtitle.trim(), `${section.id} misses a label/title/subtitle`);
  }
  for (const group of SETTINGS_GROUPS) {
    assert.ok(
      SETTINGS_SECTIONS.some((section) => section.group === group.id),
      `group ${group.id} has no section`,
    );
  }
});

test("anchor ids are unique per section and every anchor carries a label", () => {
  for (const section of SETTINGS_SECTIONS) {
    const anchorIds = section.anchors.map((anchor) => anchor.id);
    assert.equal(new Set(anchorIds).size, anchorIds.length, `duplicate anchor id in ${section.id}`);
    for (const anchor of section.anchors) {
      assert.ok(anchor.label.trim(), `${section.id}/${anchor.id} has no label`);
      assert.ok(Array.isArray(anchor.keywords), `${section.id}/${anchor.id} misses its keywords`);
    }
  }
});

test("an empty query returns every anchor of the registry", () => {
  const total = SETTINGS_SECTIONS.reduce((sum, section) => sum + section.anchors.length, 0);
  const hits = searchSettings("   ");
  assert.equal(hits.length, total);
  const keyed = new Set(hits.map((hit) => `${hit.section.id}/${hit.anchor.id}`));
  for (const section of SETTINGS_SECTIONS) {
    for (const anchor of section.anchors) {
      assert.ok(keyed.has(`${section.id}/${anchor.id}`), `the key ${section.id}/${anchor.id} is missing from the empty query results`);
    }
  }
});

test("a label-prefix match outranks a keyword-only match", () => {
  // "sec" prefixes "Account security" (label +4); "Teamspaces" only carries
  // "sec" in its keyword haystack ("asset", +1) and must rank below.
  const hits = searchSettings("sec");
  assert.equal(hits[0].section.id, "profile");
  assert.equal(hits[0].anchor.id, "account-security");
});

test("a keyword that no label prefixes still finds its anchor", () => {
  const hits = searchSettings("passkey");
  assert.ok(hits.some((hit) => hit.section.id === "profile" && hit.anchor.id === "account-security"));
});

test("an unknown id finds no section", () => {
  assert.equal(findSection("nope"), undefined);
  assert.equal(findSection("profile")?.id, "profile");
});

test("nothing under src/ still reads the package's settings index", () => {
  const FORBIDDEN = /import\s*\{[^}]*\b(?:SettingsTab|useSettingsSearchIndex)\b[^}]*\}\s*from\s*['"](?:@osionos\/ui|@\/shared\/ui)/;
  for (const path of srcFiles()) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, FORBIDDEN, `${path} still imports the modal-era settings index`);
  }
});

test("the modal and its lazy wrapper are retired", () => {
  assert.equal(existsSync(new URL("../../src/features/settings/SettingsCenter.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../src/features/settings/LazySettingsCenter.tsx", import.meta.url)), false);
});
