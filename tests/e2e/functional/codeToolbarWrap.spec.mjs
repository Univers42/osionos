/* ************************************************************************** */
/*   codeToolbarWrap.spec.mjs                                                 */
/* ************************************************************************** */

// Issue #335: the code-block toolbar buttons were shrink-0, so in a block ~80 px wide they
// ran about 55 px out of it. At any width the block must hold its toolbar: nothing scrolls
// sideways, every visible control sits inside the block box, and a control hidden to make
// room is display:none (out of the tab order), not merely transparent.

/* global document, getComputedStyle, window -- page.evaluate bodies run in the browser */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, openSlashMenuFromEditor } from "../../browser/core/app.mjs";

// The block comes from the typed "``` " shortcut, so the same steps run on the dev server and on
// the production build; it is then squeezed by styling its frame, as a narrow column or a resize does.
async function openCodeBlock(page, baseURL, widthPx) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openFreshPage(page, baseURL);
  await openSlashMenuFromEditor(await activateFirstEditor(page), "``` ");
  const card = page.locator(".osio-code-card").first();
  await card.waitFor();
  if (widthPx) await card.evaluate((node, width) => { node.style.width = `${width}px`; }, widthPx);
}

const toolbarFacts = (page) => page.evaluate(() => {
  const card = document.querySelector(".osio-code-card");
  const box = card.getBoundingClientRect();
  // The card's own scrollWidth also counts the resize handles, which sit 8 px outside it by design.
  const header = card.querySelector("[aria-haspopup=listbox]").closest(".flex-wrap");
  const body = header.nextElementSibling;
  const visible = (el) => getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
  const buttons = Array.from(card.querySelectorAll("button")).filter((el) => !el.closest("[data-code-height]"));
  const shown = buttons.filter(visible);
  return {
    cardWidth: Math.round(box.width),
    headerSpill: header.scrollWidth - header.clientWidth,
    bodySpill: body.scrollWidth - body.clientWidth,
    outside: shown.map((el) => el.getBoundingClientRect()).filter((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5).length,
    shown: shown.length,
    hiddenFocusable: buttons.filter((el) => { if (visible(el)) return false; el.focus(); return document.activeElement === el; }).length,
    page: document.documentElement.scrollWidth - window.innerWidth,
  };
});

test.describe("code toolbar wraps inside its block (#335)", () => {
  for (const width of [80, 52]) {
    test(`a ${width} px block holds its toolbar`, async ({ page, baseURL }) => {
      await openCodeBlock(page, baseURL, width);
      const facts = await toolbarFacts(page);
      expect(facts.cardWidth, "the block is really narrow").toBeLessThanOrEqual(width + 2);
      expect(facts.headerSpill, "the toolbar does not run out of the block").toBeLessThanOrEqual(0);
      expect(facts.bodySpill, "the code area does not scroll sideways").toBeLessThanOrEqual(0);
      expect(facts.outside, "every visible toolbar button is inside the block").toBe(0);
      expect(facts.shown, "at least the copy button stays reachable").toBeGreaterThanOrEqual(1);
      expect(facts.hiddenFocusable).toBe(0);
      expect(facts.page).toBeLessThanOrEqual(0);
    });
  }

  test("a normal-width block keeps all four toolbar controls", async ({ page, baseURL }) => {
    await openCodeBlock(page, baseURL, 0);
    const facts = await toolbarFacts(page);
    expect(facts.headerSpill).toBeLessThanOrEqual(0);
    expect(facts.bodySpill).toBeLessThanOrEqual(0);
    expect(facts.outside).toBe(0);
    expect(facts.shown, "language picker, line numbers, theme, copy").toBe(4);
  });
});
