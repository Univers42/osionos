/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   arrowNavigation.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/29 00:00:00 by codex             #+#    #+#             */
/*   Updated: 2026/04/29 00:00:00 by codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  createBlockViaSlash,
  createParagraphs,
  focusEditorEnd,
  focusEditorStart,
  getCodeTextarea,
  getEditors,
  openSidebarPage,
  openFreshPage,
  primeLocalState,
  setTextControlSelection,
  tableCell,
  textControlSelection,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

async function setupCodeBetweenParagraphs(page, appUrl) {
  await openFreshPage(page, appUrl);
  await createParagraphs(page, ["Before", "", "After"]);
  await createBlockViaSlash(page, "code", "Code", 1);
  const code = getCodeTextarea(page);
  await code.fill("line 1\nline 2");
  return code;
}

async function setupParagraphAndTablePage(page, appUrl) {
  await primeLocalState(page, {
    activeUserId: "mock-user-0",
    activeWorkspaceByUser: {
      "mock-user-0": "mock-ws-private-0",
    },
    pages: {
      "mock-ws-private-0": [
        {
          _id: "table-arrow-page",
          title: "Table Arrow Page",
          workspaceId: "mock-ws-private-0",
          ownerId: "mock-user-0",
          visibility: "private",
          collaborators: [],
          parentPageId: null,
          databaseId: null,
          archivedAt: null,
          content: [
            { id: "table-arrow-p", type: "paragraph", content: "Before table" },
            {
              id: "table-arrow-table",
              type: "table_block",
              content: "",
              tableData: [
                ["A1", "B1", "C1"],
                ["A2", "B2", "C2"],
                ["A3", "B3", "C3"],
              ],
            },
          ],
        },
      ],
    },
  });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await openSidebarPage(page, "table-arrow-page");
}

export const arrowNavigationScenarios = [
  defineScenario(
    "31. Arrow Navigation",
    "Between paragraphs",
    "Arrow Down at block end focuses next paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["First block", "Second block"]);
      const first = getEditors(page).first();
      await focusEditorEnd(first);
      await first.press("ArrowDown");
      await expect(getEditors(page).nth(1)).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Between paragraphs",
    "Arrow Up at block start focuses previous paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["First block", "Second block"]);
      const second = getEditors(page).nth(1);
      await focusEditorStart(second);
      await second.press("ArrowUp");
      await expect(getEditors(page).first()).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Divider navigation",
    "focused divider uses Arrow Up and Arrow Down to jump to adjacent blocks",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Before divider", "", "After divider"]);
      await createBlockViaSlash(page, "divider", "Divider", 1);

      const divider = page.getByRole("button", { name: "Divider block" });
      await divider.click();
      await divider.press("ArrowDown");
      await expect(getEditors(page).nth(1)).toBeFocused();

      await divider.click();
      await divider.press("ArrowUp");
      await expect(getEditors(page).first()).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Table entry",
    "Arrow Down from paragraph end enters first table cell",
    async ({ page, appUrl }) => {
      await setupParagraphAndTablePage(page, appUrl);
      const first = getEditors(page).first();
      await focusEditorEnd(first);
      await first.press("ArrowDown");
      await expect(tableCell(page, 0, 0)).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Code blocks",
    "Arrow Down enters code textarea and Arrow Up stays inside while another line exists",
    async ({ page, appUrl }) => {
      const code = await setupCodeBetweenParagraphs(page, appUrl);
      const before = getEditors(page).first();

      await focusEditorEnd(before);
      await before.press("ArrowDown");
      await expect(code).toBeFocused();

      const value = "line 1\nline 2";
      await setTextControlSelection(code, value.length);
      await code.press("ArrowUp");

      const selection = await textControlSelection(code);
      expect(selection.start).toBeLessThan(value.length);
      await expect(code).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Code blocks",
    "Arrow Up at top of code textarea exits to previous block",
    async ({ page, appUrl }) => {
      const code = await setupCodeBetweenParagraphs(page, appUrl);
      await setTextControlSelection(code, 0);
      await code.press("ArrowUp");
      await expect(getEditors(page).first()).toBeFocused();
    },
  ),
  defineScenario(
    "31. Arrow Navigation",
    "Code blocks",
    "Arrow Down at bottom of code textarea exits to next block",
    async ({ page, appUrl }) => {
      const code = await setupCodeBetweenParagraphs(page, appUrl);
      const value = "line 1\nline 2";
      await setTextControlSelection(code, value.length);
      await code.press("ArrowDown");
      await expect(getEditors(page).nth(1)).toBeFocused();
    },
  ),
];
