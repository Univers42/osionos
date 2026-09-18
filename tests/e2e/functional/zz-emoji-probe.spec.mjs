// Scratch probe: which emoji actually RENDER, what font serves them, and does
// ":" trigger the picker. Deleted before commit.

import { test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const SAMPLES = [
  ["U+1F600 grin (Unicode 6, ancient)", "\u{1F600}"],
  ["U+2764 heart (legacy)", "❤️"],
  ["U+1F44D thumbs up", "\u{1F44D}"],
  ["U+1F44D+1F3FD skin tone", "\u{1F44D}\u{1F3FD}"],
  ["ZWJ family", "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"],
  ["rainbow flag ZWJ", "\u{1F3F3}️‍\u{1F308}"],
  ["U+1FAE0 melting face (14.0)", "\u{1FAE0}"],
  ["U+1FAE8 shaking face (15.0)", "\u{1FAE8}"],
  ["U+1FADF splatter (16.0)", "\u{1FADF}"],
  ["U+1FAC6 fingerprint (17.0)", "\u{1FAC6}"],
];

test("emoji rendering + font resolution", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.waitForTimeout(300);

  const report = await page.evaluate((samples) => {
    const probe = document.createElement("div");
    probe.className = "osionos-page";
    document.body.appendChild(probe);
    const span = document.createElement("span");
    probe.appendChild(span);
    const font = getComputedStyle(document.body).fontFamily;

    // Render a glyph to canvas and hash the pixels. A codepoint the font lacks
    // paints the SAME .notdef box every time, so matching the control = tofu.
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    function sig(text) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.font = `32px ${font}`;
      ctx.textBaseline = "top";
      ctx.fillText(text, 4, 4);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      let h = 0, ink = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] !== 0) ink += 1;
        h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) >>> 0;
      }
      return { h, ink, w: ctx.measureText(text).width };
    }
    // Two controls: unassigned planes that no font can have.
    const controlA = sig("\u{10FFFD}");
    const controlB = sig("\u{0FFFFD}");
    const results = samples.map(([label, ch]) => {
      const s = sig(ch);
      return {
        label,
        width: Math.round(s.w * 10) / 10,
        ink: s.ink,
        tofu: s.h === controlA.h || s.h === controlB.h,
        blank: s.ink === 0,
      };
    });
    probe.remove();
    return { font, controlInk: controlA.ink, results };
  }, SAMPLES);

  console.log("FONT:", report.font);
  console.log("control tofu ink:", report.controlInk);
  for (const r of report.results) {
    console.log(
      `${r.tofu ? "TOFU  " : r.blank ? "BLANK " : "ok    "} ${r.label.padEnd(34)} w=${r.width} ink=${r.ink}`,
    );
  }

  // Does ":" alone open the picker? And ":" mid-word?
  await editor.click();
  await page.keyboard.type("hello :");
  await page.waitForTimeout(400);
  const afterColon = await page.locator('[data-testid="emoji-picker"], [role="dialog"]').count();
  console.log("picker visible after 'hello :':", afterColon);
  await page.keyboard.type("sm");
  await page.waitForTimeout(400);
  console.log("picker after ':sm':", await page.locator('[data-testid="emoji-picker"], [role="dialog"]').count());
});
