import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  clearAndTypePageTitle,
  focusEditorEnd,
  getEditors,
  openFreshPage,
  pageTitleEditor,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";
import { runLocalCommand } from "../core/system.mjs";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openPageFromSidebar(page, title) {
  const button = page
    .locator("nav button")
    .filter({ hasText: new RegExp(`^${escapeRegex(title)}$`) })
    .first();
  await button.waitFor({ state: "visible" });
  await button.scrollIntoViewIfNeeded();
  await button.click({ force: true });
  await pageTitleEditor(page).waitFor();
}

export const persistenceAndQualityScenarios = [
  defineScenario(
    "29. Local persistence",
    "Seeded offline pages",
    "edits on an offline seeded page survive refresh and remain editable afterwards",
    async ({ page, appUrl }) => {
      const token = `persist-${Date.now().toString(36)}`;
      await page.addInitScript(() => {
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
      await page.route("**/api/**", (route) => route.abort());
      await page.goto(appUrl, { waitUntil: "networkidle" });
      await openPageFromSidebar(page, "Getting Started");
      const editor = await activateFirstEditor(page);
      await focusEditorEnd(editor);
      await page.keyboard.type(` ${token}`);
      await page.waitForTimeout(300);

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

      await page.route("**/api/**", (route) => route.abort());
      await openFreshPage(page, appUrl);
      await clearAndTypePageTitle(page, title);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, body);
      await page.waitForTimeout(300);

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
  ),
  defineScenario(
    "30. Technical Integration Quality",
    "Audit pipeline",
    "make audit completes the local quality pipeline successfully",
    async () => {
      await runLocalCommand("make", ["audit"]);
    },
  ),
];
