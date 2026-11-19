// The shell catalogue: every shell is shallow enough (PS17), survives both page
// formats unchanged (PS21), and neither the catalogue nor SEED_PAGES carries a
// cover-layout field (CV15). The catalogue is code, never a seed page (PS18).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SEED_PAGES } from "@/data/seedPages";
import { SHELLS, loadShell } from "../../src/data/templates/shells/shellIndex.ts";
import { attributeRoundTrip, blockDepth, coverLayoutKeysIn, fileRoundTrip, layoutProjection, markdownProjection, markdownRoundTrip } from "./support/catalogue-checks.ts";

const WAVE_ONE = ["profile", "landing", "portfolio", "docs", "blog-post", "about", "pricing", "changelog", "link-in-bio", "resume", "event", "contact"];

test("wave 1 is in the catalogue, each shell once", () => {
  const ids = SHELLS.map((shell) => shell.id);
  assert.deepEqual(ids.filter((id) => WAVE_ONE.includes(id)).sort(), [...WAVE_ONE].sort());
  assert.equal(new Set(ids).size, ids.length);
});

const WAVE_TWO = [
  "product-launch", "app-landing", "team", "services", "agency", "case-study", "blog-index", "docs-home", "knowledge-base",
  "faq", "personal-home", "webinar", "course", "newsletter", "product", "catalogue", "restaurant", "recipe", "gallery",
  "dashboard", "roadmap", "meeting-notes", "careers", "coming-soon", "not-found",
];

test("wave 2 is in the catalogue, each shell with a title, an icon and a description", () => {
  const wave = SHELLS.filter((shell) => WAVE_TWO.includes(shell.id));
  assert.deepEqual(wave.map((shell) => shell.id).sort(), [...WAVE_TWO].sort());
  for (const shell of wave) assert.ok(shell.title && shell.icon && shell.description.length >= 12, shell.id);
});

for (const { id } of SHELLS) {
  test(`shell ${id}: depth ≤ 8, both round trips unchanged, no cover-layout key`, async () => {
    const blocks = await loadShell(id);
    assert.ok(blocks && blocks.length > 0, `${id} builds blocks`);
    assert.ok(blockDepth(blocks) <= 8, `${id} depth ${blockDepth(blocks)}`);
    assert.deepEqual(markdownProjection(markdownRoundTrip(blocks)), markdownProjection(blocks), `${id} markdown`);
    assert.deepEqual(fileRoundTrip(blocks), blocks, `${id} .omd`);
    assert.deepEqual(layoutProjection(attributeRoundTrip(blocks)), layoutProjection(blocks), `${id} layout attributes`);
    assert.deepEqual(coverLayoutKeysIn(blocks), []);
  });
}

test("CV15: no cover-layout key in the shell metadata or in SEED_PAGES", () => {
  assert.deepEqual(coverLayoutKeysIn(SHELLS), []);
  assert.deepEqual(coverLayoutKeysIn(SEED_PAGES), []);
});

test("PS18: no shell is a seed page, and the seeded template index never imports the catalogue", () => {
  const titles = new Set(SHELLS.map((shell) => shell.title));
  assert.deepEqual(SEED_PAGES.filter((page) => titles.has(page.title) || SHELLS.some((shell) => shell.id === page._id)).map((page) => page._id), []);
  const seededIndex = readFileSync(new URL("../../src/data/templates/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(seededIndex, /shells|sections/);
});

test("an unknown shell loads nothing", async () => {
  assert.equal(await loadShell("no-such-shell"), null);
});
