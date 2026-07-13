/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawHelpers.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 11:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 11:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared plumbing for /draw e2e specs: open a page with one draw block, drag on
// the canvas, and assert PAINTED PIXELS (the complaints these specs guard
// against were visual — scene JSON being right would not catch them).

import { expect } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

// The canvas carries floating chrome: toolbar (top-centre), inspector
// (top-right), zoom bar (bottom-left). Drawing coordinates stay inside this
// chrome-free box, or a "drag" lands on a button instead of the canvas.
export const SAFE = { minX: 20, maxX: 440, minY: 90, maxY: 340 };

/** RGBA of the canvas pixel at CSS coords, honouring devicePixelRatio. */
export async function pixelAt(page, cssX, cssY) {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('div[aria-label="Drawing"] canvas');
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const { data } = ctx.getImageData(
        Math.round((x * canvas.width) / rect.width),
        Math.round((y * canvas.height) / rect.height),
        1,
        1,
      );
      return [data[0], data[1], data[2], data[3]];
    },
    { x: cssX, y: cssY },
  );
}

/** Any ink within ±3px of the point — roughjs wobble + antialiasing make a
 *  single-pixel probe flaky, and "is something drawn here" is the question. */
export async function inkedNear(page, cssX, cssY, background) {
  return page.evaluate(
    ({ x, y, bg, radius }) => {
      const canvas = document.querySelector('div[aria-label="Drawing"] canvas');
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = Math.round((x - radius) * scaleX);
      const py = Math.round((y - radius) * scaleY);
      const size = Math.max(1, Math.round(radius * 2 * scaleX));
      const { data } = ctx.getImageData(px, py, size, size);
      for (let i = 0; i < data.length; i += 4) {
        const delta =
          Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
        if (delta > 24) return true;
      }
      return false;
    },
    { x: cssX, y: cssY, bg: background, radius: 3 },
  );
}

export async function drag(page, box, from, to) {
  for (const [x, y] of [from, to]) {
    expect(x, "drag stays clear of the floating chrome").toBeGreaterThanOrEqual(SAFE.minX);
    expect(x).toBeLessThanOrEqual(SAFE.maxX);
    expect(y).toBeGreaterThanOrEqual(SAFE.minY);
    expect(y).toBeLessThanOrEqual(SAFE.maxY);
  }
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** A page holding one focused /draw block, plus its canvas box and background. */
export async function openDrawBlock(page, appUrl) {
  await openFreshPage(page, appUrl);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/draw");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");

  const canvas = page.locator('div[aria-label="Drawing"] canvas');
  await canvas.waitFor();
  await page.waitForTimeout(300);
  await canvas.click({ position: { x: 8, y: 8 } }); // focus: the hotkeys live on the canvas
  return { canvas, box: await canvas.boundingBox(), background: await pixelAt(page, 8, 8) };
}

/** A just-drawn element is selected and its handles' light fill covers the very
 *  pixels we sample — click an empty corner to deselect before reading. */
export async function deselect(page, canvas) {
  await canvas.click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(120);
}
