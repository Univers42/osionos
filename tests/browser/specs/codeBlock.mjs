/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   codeBlock.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  getCodeTextarea,
  openFreshPage,
  openSlashMenuFromEditor,
  waitForRenderStability,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

const RENDERABLE = new Set(["mermaid"]);

async function insertCodeBlock(page, language) {
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "``` ");
  await page.locator('textarea[placeholder="Code…"]').waitFor({ state: "visible", timeout: 10_000 });
  if (language !== "plaintext") {
    await page.locator('button.font-mono').first().click();
    await page.getByRole("button", { name: language, exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: language, exact: true }).click();
    await waitForRenderStability(page);
  }
  if (RENDERABLE.has(language)) {
    await page.locator('button[title="Show source"]').waitFor({ state: "visible", timeout: 10_000 });
  }
}

export const codeBlockScenarios = [
  defineScenario(
    "7. Code block",
    "Horizontal scroll",
    "a code block with a 200-char line scrolls horizontally instead of wrapping",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");

      const ta = getCodeTextarea(page);
      await ta.waitFor({ state: "visible" });
      await ta.fill("x".repeat(200));
      await waitForRenderStability(page);

      const scrolls = await ta.evaluate((node) => node.scrollWidth > node.clientWidth);
      expect(scrolls).toBe(true);

      await page.waitForFunction(
        () => {
          const t = document.querySelector('textarea[placeholder="Code…"]');
          const code = t?.parentElement?.querySelector("code");
          return code ? code.scrollWidth > code.clientWidth : false;
        },
        null,
        { timeout: 5000 },
      );
    },
  ),
  defineScenario(
    "7. Code block",
    "Horizontal scroll",
    "a mermaid code block in source mode also scrolls horizontally for long lines",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");

      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);

      const ta = getCodeTextarea(page);
      await ta.waitFor({ state: "visible" });
      await ta.fill("x".repeat(200));
      await waitForRenderStability(page);

      const scrolls = await ta.evaluate((node) => node.scrollWidth > node.clientWidth);
      expect(scrolls).toBe(true);

      await page.waitForFunction(
        () => {
          const t = document.querySelector('textarea[placeholder="Code…"]');
          const code = t?.parentElement?.querySelector("code");
          return code ? code.scrollWidth > code.clientWidth : false;
        },
        null,
        { timeout: 5000 },
      );
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "corner button is visible for a mermaid block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await expect(page.locator('button[title="Show source"]')).toBeVisible();
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "corner button is NOT present for a typescript block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      await expect(page.locator('button[title="Show source"]')).toHaveCount(0);
      await expect(page.locator('button[title="Show preview"]')).toHaveCount(0);
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "mermaid block defaults to preview mode — textarea is absent",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await expect(page.locator('button[title="Show source"]')).toBeVisible();
      await expect(page.locator('textarea[placeholder="Code…"]')).toHaveCount(0);
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "clicking Show source reveals the textarea and updates the button label",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");

      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);

      await expect(page.locator('button[title="Show preview"]')).toBeVisible();
      await expect(page.locator('textarea[placeholder="Code…"]')).toBeVisible();
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "clicking Show preview from source mode hides the textarea again",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");

      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);
      await page.locator('button[title="Show preview"]').click();
      await waitForRenderStability(page);

      await expect(page.locator('button[title="Show source"]')).toBeVisible();
      await expect(page.locator('textarea[placeholder="Code…"]')).toHaveCount(0);
    },
  ),
  defineScenario(
    "7. Code block",
    "Preview/source toggle",
    "codeView=source persists after page.reload()",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const uniqueTitle = `codeblock-persist-${Date.now().toString(36)}`;
      await page.getByRole("textbox", { name: "Page title" }).fill(uniqueTitle);
      await insertCodeBlock(page, "mermaid");

      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);
      await expect(page.locator('button[title="Show preview"]')).toBeVisible();

      await page.reload({ waitUntil: "networkidle" });

      const sidebarEntry = page.locator("nav button").filter({ hasText: uniqueTitle }).first();
      await sidebarEntry.waitFor({ state: "visible", timeout: 15_000 });
      await sidebarEntry.click();

      await page.locator('button[title="Show preview"]').waitFor({ state: "visible", timeout: 10_000 });
      await expect(page.locator('button[title="Show preview"]')).toBeVisible();
    },
  ),
];
