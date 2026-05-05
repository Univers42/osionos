/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   persistenceAndQuality.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/27 10:00:29 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/06 00:08:25 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  clearAndTypePageTitle,
  focusEditorEnd,
  getEditors,
  pageTitleEditor,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";
import { runLocalCommand } from "../core/system.mjs";

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function sidebarNewPageButton(page) {
  return page.locator('button[title="New page"]').first();
}

async function waitForSidebarReady(page) {
  try {
    await sidebarNewPageButton(page).waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    throw new Error("Sidebar did not become ready after load");
  }
}

async function openPageFromSidebar(page, title) {
  const titleEditor = pageTitleEditor(page);
  if ((await titleEditor.count()) > 0) {
    const currentTitle = (await titleEditor.textContent()) ?? "";
    if (currentTitle.includes(title)) {
      return;
    }
  }

  await waitForSidebarReady(page);
  const button = page
    .locator("nav button")
    .filter({ hasText: new RegExp(escapeRegex(title), "i") })
    .first();

  try {
    await button.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    throw new Error(`Could not find sidebar entry for page "${title}" after reload`);
  }

  await button.scrollIntoViewIfNeeded();
  await button.click();

  try {
    await expect(pageTitleEditor(page)).toContainText(title, { timeout: 10_000 });
  } catch {
    throw new Error(`Sidebar entry for "${title}" was visible but did not open the page editor`);
  }
}

async function waitForPagesCacheToContain(page, value) {
  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("pg:pages") ?? ""),
    )
    .toContain(value);
}

export const persistenceAndQualityScenarios = [
  defineScenario(
    "29. Local persistence",
    "Seeded offline pages",
    "edits on an offline seeded page survive refresh and remain editable afterwards",
    async ({ page, appUrl }) => {
      const token = `persist-${Date.now().toString(36)}`;
      await page.goto(appUrl, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem(
          "pg:pages",
          JSON.stringify({
            "mock-ws-private-0": [
              {
                _id: "offline-seed-page",
                title: "Getting Started",
                workspaceId: "mock-ws-private-0",
                ownerId: "mock-user-0",
                visibility: "private",
                collaborators: [],
                parentPageId: null,
                databaseId: null,
                archivedAt: null,
                content: [
                  {
                    id: "seed-block-1",
                    type: "paragraph",
                    content: "Offline seed body",
                  },
                ],
              },
            ],
          }),
        );
        localStorage.setItem("pg:recents", "[]");
      });
      await page.goto(appUrl, { waitUntil: "networkidle" });
      await openPageFromSidebar(page, "Getting Started");
      const editor = await activateFirstEditor(page);
      await focusEditorEnd(editor);
      await page.keyboard.type(` ${token}`);
      await waitForPagesCacheToContain(page, token);

      await page.reload({ waitUntil: "networkidle" });
      await openPageFromSidebar(page, "Getting Started");
      await expect(getEditors(page).first()).toContainText(token);

      await focusEditorEnd(getEditors(page).first());
      await page.keyboard.type(" editable");
      await expect(getEditors(page).first()).toContainText(`${token} editable`);
    },
  ),
  defineScenario(
    "29. Local persistence",
    "Local pages",
    "a locally created page survives refresh and can be reopened with its content intact",
    async ({ page, appUrl }) => {
      const title = `Local persistence ${Date.now().toString(36)}`;
      const body = `Body ${Date.now().toString(36)}`;

      await page.goto(appUrl, { waitUntil: "networkidle" });
      await waitForSidebarReady(page);
      await sidebarNewPageButton(page).click();
      await pageTitleEditor(page).waitFor();
      await clearAndTypePageTitle(page, title);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, body);
      await waitForPagesCacheToContain(page, title);
      await waitForPagesCacheToContain(page, body);

      await page.reload({ waitUntil: "networkidle" });
      await openPageFromSidebar(page, title);
      await expect(pageTitleEditor(page)).toContainText(title);
      await expect(getEditors(page).first()).toContainText(body);

      await focusEditorEnd(getEditors(page).first());
      await page.keyboard.type(" retained");
      await expect(getEditors(page).first()).toContainText(`${body} retained`);
    },
  ),
  defineScenario(
    "30. Technical Integration Quality",
    "Local quality gate",
    "make ci passes without type or lint errors",
    async () => {
      await runLocalCommand("make", ["ci"]);
    },
    { needsBrowser: false, serial: true },
  ),
  defineScenario(
    "30. Technical Integration Quality",
    "Audit pipeline",
    "make audit completes the local quality pipeline successfully",
    async () => {
      await runLocalCommand("make", ["audit"]);
    },
    { needsBrowser: false, serial: true },
  ),
];
