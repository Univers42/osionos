/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graphBlockWheel.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global document, localStorage, sessionStorage, window */

// The wheel over a graph block inside a page scrolls the page; only ctrl+wheel
// (and a trackpad pinch, which carries ctrlKey) reaches the graph to zoom.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const BLOCKS = [
  { id: "d0", type: "paragraph", content: "Line 0" },
  { id: "gv", type: "graph_view", content: "" },
  ...Array.from({ length: 40 }, (_, index) => ({ id: `d${index + 1}`, type: "paragraph", content: `Line ${index + 1}` })),
];

const pageScrollTop = (page) =>
  page.locator('.osionos-page [data-block-id="d0"]').first().evaluate((el) => {
    let node = el.parentElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    return node ? node.scrollTop : document.scrollingElement.scrollTop;
  });

test.beforeEach(async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await stubBridge(page, () => undefined);
  await page.addInitScript(({ ws, blocks }) => {
    if (sessionStorage.getItem("graph-seeded") !== null) return;
    sessionStorage.setItem("graph-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{
      _id: "graph-host", title: "Graph host", workspaceId: ws, ownerId: "mock-user-0", visibility: "private",
      collaborators: [], parentPageId: null, databaseId: null, archivedAt: null, content: blocks,
    }]));
    localStorage.setItem("pg:recents", "[]");
  }, { ws: WS, blocks: BLOCKS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Graph host").click();
  // The stub has no graph pack: a canvas that zooms on every wheel stands in for the studio's.
  const view = page.locator('.osionos-page article[data-draggable-block-id="gv"] [data-testid="graph-studio-view"]');
  await expect(view).toHaveCount(1);
  await view.evaluate((root) => {
    const canvas = document.createElement("canvas");
    canvas.dataset.testid = "zoom-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    window.graphZooms = 0;
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      window.graphZooms += 1;
    }, { passive: false });
    root.append(canvas);
  });
});

async function pointAtGraph(page) {
  const box = await page.getByTestId("zoom-canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120));
}

test("the wheel over an inline graph scrolls the page", async ({ page }) => {
  await pointAtGraph(page);
  const before = await pageScrollTop(page);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(before + 300);
  expect(await page.evaluate(() => window.graphZooms)).toBe(0);
});

test("ctrl+wheel over an inline graph still zooms it", async ({ page }) => {
  await pointAtGraph(page);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 200);
  await page.keyboard.up("Control");
  await expect.poll(() => page.evaluate(() => window.graphZooms)).toBeGreaterThan(0);
});
