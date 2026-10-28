/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   handleAlignment.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 22:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 22:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global document, localStorage, sessionStorage */

// The drag handle and the to-do box / toggle chevron sit on the first line of the
// text beside them. They sat 2-4px high: the handle ignored the leaf's padding and
// the markers used a fixed mt-[3px] that broke once the body line grew.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const BLOCKS = [
  { id: "a-p", type: "paragraph", content: "Paragraph" },
  { id: "a-h1", type: "heading_1", content: "Heading" },
  { id: "a-li", type: "bulleted_list", content: "Bullet" },
  { id: "a-todo", type: "to_do", content: "To-do", checked: false },
  { id: "a-tg", type: "toggle", content: "Toggle", children: [] },
  { id: "a-q", type: "quote", content: "Quote" },
];

test("handles and line markers centre on the first text line", async ({ page, baseURL }) => {
  await stubBridge(page, () => undefined);
  await page.addInitScript(({ ws, blocks }) => {
    if (sessionStorage.getItem("align-seeded") !== null) return;
    sessionStorage.setItem("align-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{
      _id: "align-host", title: "Align host", workspaceId: ws, ownerId: "mock-user-0", visibility: "private",
      collaborators: [], parentPageId: null, databaseId: null, archivedAt: null, content: blocks,
    }]));
    localStorage.setItem("pg:recents", "[]");
  }, { ws: WS, blocks: BLOCKS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Align host").click();

  for (const { id } of BLOCKS) {
    const block = page.locator(`.osionos-page [data-block-id="${id}"]`).first();
    await block.hover();
    const offsets = await block.evaluate((el) => {
      const editable = el.querySelector("[contenteditable]");
      const range = document.createRange();
      range.selectNodeContents(editable);
      const line = range.getClientRects()[0];
      const lineCentre = line.top + line.height / 2;
      const centre = (node) => {
        const rect = node.getBoundingClientRect();
        return rect.top + rect.height / 2 - lineCentre;
      };
      const article = el.closest("article[data-draggable-block-id]");
      const marker = el.querySelector('[data-testid="todo-checkbox"], button[aria-expanded]');
      return { handle: centre(article.querySelector(".osio-drag-handle")), marker: marker ? centre(marker) : 0 };
    });
    expect(Math.abs(offsets.handle), `${id} handle`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(offsets.marker), `${id} marker`).toBeLessThanOrEqual(1.5);
  }
});
