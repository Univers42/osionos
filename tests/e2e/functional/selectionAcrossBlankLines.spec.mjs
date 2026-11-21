/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectionAcrossBlankLines.spec.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Issue #326: across blank lines the selection and the caret left the text. Two
// shared paths, one per symptom. (1) The caret of an empty line inside a block
// (Shift+Enter twice) has no client rect, so caretRect fell back to the whole
// block's box and the drawn caret stretched over every line. (2) A drag across
// blocks painted its own tints, and a blank line at either end of the drag got
// none while the rows around it did, and the partial tint was the glyph box (20 px)
// where the native highlight is the line box (26 px). Painted geometry must follow
// the line boxes, blank lines included.

/* global document, localStorage, getComputedStyle */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const LEAVES = '.osionos-page [data-block-id] [contenteditable="true"]';
const SLACK = 1.5;

const seedBlocks = async (page, baseURL, lines) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  for (const line of lines) {
    if (line) await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
};

/** The block's lines separated by Shift+Enter: "" is a blank line in the same block. */
const typeSoftLines = async (page, lines) => {
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Shift+Enter");
    if (line) await page.keyboard.type(line);
  }
};

const drawnCaretLine = (page) => page.evaluate(() => {
  const host = document.activeElement.getBoundingClientRect();
  const caret = document.querySelector(".osio-drawn-caret").getBoundingClientRect();
  const pitch = Number.parseFloat(getComputedStyle(document.activeElement).lineHeight);
  return { line: Math.floor((caret.top + caret.height / 2 - host.top) / pitch), height: caret.height, pitch, hidden: document.querySelector(".osio-drawn-caret").hidden };
});

test.describe("caret across blank lines inside a block (#326)", () => {
  test("the drawn caret sits on the line it is on, empty lines included", async ({ page, baseURL }) => {
    await page.addInitScript(() => localStorage.setItem("osionos:appearance", JSON.stringify({ caretShape: "thick" })));
    await seedBlocks(page, baseURL, []);
    await typeSoftLines(page, ["Alpha", "", "Gamma", "", "Omega"]);
    await page.keyboard.press("Control+Home");
    for (let line = 0; line < 5; line += 1) {
      await expect.poll(async () => (await drawnCaretLine(page)).line, { message: `caret on line ${line}` }).toBe(line);
      const drawn = await drawnCaretLine(page);
      expect(drawn.hidden).toBe(false);
      expect(drawn.height, "the caret is one line tall, not the whole block").toBeLessThanOrEqual(drawn.pitch + SLACK);
      if (line < 4) await page.keyboard.press("ArrowDown");
    }
  });
});

/** Painted state of a drag across blocks: each leaf's band and every custom tint. */
const painted = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
  const leaves = Array.from(document.querySelectorAll('.osionos-page [data-block-id] [contenteditable="true"]'));
  return {
    pitch: Number.parseFloat(getComputedStyle(leaves[0]).lineHeight),
    leaves: leaves.map((el) => ({ ...box(el), blank: el.textContent === "" })),
    tints: Array.from(document.querySelectorAll(".osio-cross-select-tint")).map(box),
  };
});

const overlapOf = (band, tints) => tints.reduce(
  (sum, tint) => sum + Math.max(0, Math.min(band.bottom, tint.bottom) - Math.max(band.top, tint.top)), 0);

const dragAcross = async (page, [from, to], [fromX, toX]) => {
  const leaves = page.locator(LEAVES);
  const start = await leaves.nth(from).boundingBox();
  const end = await leaves.nth(to).boundingBox();
  const sign = to > from ? 1 : -1;
  await page.mouse.move(start.x + fromX, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + fromX, start.y + start.height / 2 + sign * 20, { steps: 5 });
  await page.mouse.move(end.x + toX, end.y + end.height / 2, { steps: 15 });
  await expect(page.locator(".osio-cross-select-tint").first()).toBeAttached();
};

function expectAligned(state, covered) {
  for (const tint of state.tints) {
    const home = state.leaves.find((leaf) => tint.top >= leaf.top - SLACK && tint.bottom <= leaf.bottom + SLACK);
    expect(home, "every painted rectangle lies inside one line's band").toBeTruthy();
    expect(tint.height, "a painted rectangle is at least a line box tall").toBeGreaterThanOrEqual(state.pitch - SLACK);
  }
  for (const index of covered) {
    const leaf = state.leaves[index];
    expect(overlapOf(leaf, state.tints), `line ${index} is painted`).toBeGreaterThanOrEqual(Math.min(leaf.height, state.pitch) - SLACK);
  }
}

// The anchor block of a text line keeps the native highlight, so only the tint layer is measured there.
const SCENARIOS = [
  { name: "starts on a blank line", drag: [1, 4], x: [5, 60], covered: [1, 2, 3, 4] },
  { name: "ends on a blank line", drag: [0, 3], x: [40, 100], covered: [1, 2, 3] },
  { name: "runs upward from the last line", drag: [4, 0], x: [100, 30], covered: [0, 1, 2, 3] },
];

test.describe("selection across blank lines between blocks (#326)", () => {
  for (const scenario of SCENARIOS) {
    test(`the painted ranges follow the line boxes: ${scenario.name}`, async ({ page, baseURL }) => {
      await seedBlocks(page, baseURL, ["First line", "", "Third line", "", "Fifth line"]);
      await dragAcross(page, scenario.drag, scenario.x);
      expectAligned(await painted(page), scenario.covered);
      await page.mouse.up();
    });
  }
});
