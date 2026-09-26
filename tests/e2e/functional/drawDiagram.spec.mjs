/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawDiagram.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 17:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 11:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The /draw block as a DIAGRAM tool: the canvas is a real surface, connectors
// draw and BIND to the shapes they join (move one, the arrow follows), a shape
// carries a centred label typed by double-click, and right-clicking a connector
// picks its extremities.

import { expect, test } from "@playwright/test";

import { deselect, drag, inkedNear, openDrawBlock, pixelAt } from "../support/drawHelpers.mjs";

test.describe("draw block — diagramming", () => {
  test("canvas paints its own surface, distinct from the page behind it", async ({ page, baseURL }) => {
    await openDrawBlock(page, baseURL);

    const [r, g, b, a] = await pixelAt(page, 30, 30);
    expect(a, "the canvas is painted, not see-through").toBe(255);

    const pageBg = await page.evaluate(() => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim();
      const probe = document.createElement("div");
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb.match(/\d+/g).slice(0, 3).map(Number);
    });
    const delta = Math.abs(r - pageBg[0]) + Math.abs(g - pageBg[1]) + Math.abs(b - pageBg[2]);
    expect(delta, "the canvas surface differs from the page it sits on").toBeGreaterThan(3);
  });

  test("an arrow draws between two shapes and follows the one that moves", async ({ page, baseURL }) => {
    const { canvas, box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [30, 110], [130, 170]); // shape A, centre (80, 140)
    await page.keyboard.press("r");
    await drag(page, box, [300, 110], [400, 170]); // shape B, centre (350, 140)

    // Arrow drawn from inside A to inside B: each end binds to the shape under it.
    await page.keyboard.press("a");
    await drag(page, box, [80, 140], [350, 140]);
    await deselect(page, canvas);

    // A bound connector always runs along the line joining the two centres, so the
    // centres' midpoint is on its shaft — whatever the shapes' edges do.
    expect(await inkedNear(page, 215, 140, background), "the arrow's shaft is painted").toBe(true);

    // Move B down. The arrow must re-anchor: gone from the old shaft, present on the new.
    await page.keyboard.press("v");
    await drag(page, box, [350, 140], [350, 320]);
    await deselect(page, canvas);

    expect(await inkedNear(page, 215, 140, background), "the old shaft is gone — the arrow moved").toBe(false);
    expect(await inkedNear(page, 215, 230, background), "the arrow re-anchored to the moved shape").toBe(true);
  });

  test("double-click writes a centred label inside a shape", async ({ page, baseURL }) => {
    const { box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [60, 110], [260, 210]); // centre (160, 160)

    await page.keyboard.press("v");
    await page.mouse.dblclick(box.x + 160, box.y + 160);

    await expect(page.getByLabel("Text editor"), "double-click opens the label editor").toBeVisible();
    await page.keyboard.type("Users");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // The label is painted at the shape's CENTRE — not at the click point, and not
    // at the top-left where a free (unbound) text element would land.
    expect(await inkedNear(page, 160, 160, background), "the label sits centred in the shape").toBe(true);
  });

  test("right-clicking a connector chooses its extremities", async ({ page, baseURL }) => {
    const { box, background } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("l"); // a plain LINE: no head at either end
    await drag(page, box, [60, 200], [360, 200]);
    expect(await inkedNear(page, 372, 200, background), "a bare line ends where it ends").toBe(false);

    await page.mouse.click(box.x + 200, box.y + 200, { button: "right" });
    const menu = page.getByRole("menu", { name: "Canvas menu" });
    await expect(menu, "right-click on a connector opens the menu").toBeVisible();

    const endDiamond = page.getByRole("button", { name: "End: Diamond" });
    await expect(endDiamond).toHaveAttribute("aria-pressed", "false");
    await endDiamond.click();
    await expect(endDiamond, "the chosen extremity is the live one").toHaveAttribute("aria-pressed", "true");

    // A diamond is a filled blob back from the tip — the bare line had nothing there.
    expect(await inkedNear(page, 352, 200, background), "the diamond head is painted at the end").toBe(true);
  });

  test("right-clicking a plain shape offers edit verbs but no extremities", async ({ page, baseURL }) => {
    const { box } = await openDrawBlock(page, baseURL);

    await page.keyboard.press("r");
    await drag(page, box, [60, 110], [220, 210]);

    await page.mouse.click(box.x + 140, box.y + 160, { button: "right" });
    const menu = page.getByRole("menu", { name: "Canvas menu" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    // A rectangle has no line ends to configure.
    await expect(page.getByRole("button", { name: "End: Diamond" })).toHaveCount(0);
  });
});
