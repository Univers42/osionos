/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawEditing.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 11:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 11:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Excalidraw-class EDITING layer of /draw: duplicate, keyboard nudge,
// z-order via the context menu, grouping, and the zoom controls. Assertions on
// painted pixels — these features either move ink or they don't work.

import { expect, test } from "@playwright/test";

import { deselect, drag, inkedNear, openDrawBlock, pixelAt } from "../support/drawHelpers.mjs";

test.describe("draw block — editing", () => {
  test("⌘D duplicates the selection with a visible offset", async ({ page, baseURL }) => {
    const { canvas, box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [60, 110], [140, 170]);
    // The copy lands +12,+12 — its bottom edge (y≈182) is below the original's.
    expect(await inkedNear(page, 100, 182, background), "nothing there before duplicating").toBe(false);

    await page.keyboard.press("ControlOrMeta+d");
    await page.waitForTimeout(200);
    await deselect(page, canvas);
    expect(await inkedNear(page, 100, 182, background), "the duplicate's edge is painted").toBe(true);
  });

  test("arrow keys nudge the selection (Shift = 10px steps)", async ({ page, baseURL }) => {
    const { canvas, box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [60, 110], [140, 170]); // left edge on x=60, stays selected
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(200);
    await deselect(page, canvas);

    expect(await inkedNear(page, 60, 140, background), "the old left edge is empty").toBe(false);
    expect(await inkedNear(page, 90, 140, background), "the shape sits 30px to the right").toBe(true);
  });

  test("send-to-back via the context menu changes which shape wins the overlap", async ({ page, baseURL }) => {
    const { box } = await openDrawBlock(page, baseURL);

    // Pink solid rect A…
    await page.keyboard.press("r");
    await drag(page, box, [60, 110], [200, 210]);
    await page.getByRole("button", { name: "#ffc9c9" }).click();
    await page.getByRole("button", { name: "Solid" }).click();
    // …then blue solid rect B overlapping it (drawn later ⇒ on top). Fill style
    // must be Solid for B too — a hachure overlap would let A's pink through.
    await page.keyboard.press("r");
    await drag(page, box, [130, 110], [270, 210]);
    await page.getByRole("button", { name: "#a5d8ff" }).click();
    await page.getByRole("button", { name: "Solid" }).click();
    await page.waitForTimeout(200);

    const mid = await pixelAt(page, 165, 160); // inside the overlap
    expect(mid[2], "B (blue) wins the overlap while on top").toBeGreaterThan(mid[0]);

    // B is still selected from drawing it — right-click it and send it back.
    await page.mouse.click(box.x + 165, box.y + 160, { button: "right" });
    await page.getByRole("menuitem", { name: "Send to back" }).click();
    await page.waitForTimeout(200);

    const after = await pixelAt(page, 165, 160);
    expect(after[0], "A (pink) wins the overlap once B is behind").toBeGreaterThan(after[2]);
  });

  test("⌘G groups two shapes so dragging one moves both", async ({ page, baseURL }) => {
    const { canvas, box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [40, 110], [120, 170]); // A, centre (80, 140)
    await page.keyboard.press("r");
    await drag(page, box, [180, 110], [260, 170]); // B, centre (220, 140)

    // Marquee both with the select tool, group them.
    await page.keyboard.press("v");
    await drag(page, box, [30, 100], [270, 180]);
    await page.keyboard.press("ControlOrMeta+g");
    await page.waitForTimeout(150);

    // Drag A alone; the group brings B along. Sample B's LEFT EDGE (x=180) —
    // rectangles are unfilled, so the centre is background either way.
    await drag(page, box, [80, 140], [80, 300]);
    await deselect(page, canvas);

    expect(await inkedNear(page, 180, 140, background), "B's edge left its old spot").toBe(false);
    expect(await inkedNear(page, 180, 300, background), "B followed A by the same delta").toBe(true);
  });

  test("the zoom bar zooms and resets", async ({ page, baseURL }) => {
    await openDrawBlock(page, baseURL);

    const readout = page.getByRole("button", { name: /reset to 100 percent/i });
    await expect(readout).toContainText("100%");
    await page.getByRole("button", { name: "Zoom in (⌘+)" }).click();
    await expect(readout).toContainText("120%");
    await readout.click();
    await expect(readout).toContainText("100%");
  });
});
