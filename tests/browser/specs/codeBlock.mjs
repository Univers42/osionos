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

  // ── T7b: Bug G — no permanent highlight in mermaid preview ──────────────

  defineScenario(
    "7b. Code block followups",
    "Bug G: mermaid highlight",
    "mermaid block in preview mode has transparent background at rest",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");

      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);
      const ta = getCodeTextarea(page);
      await ta.fill("graph TD; A-->B");
      await waitForRenderStability(page);

      await page.locator('button[title="Show preview"]').click();
      await waitForRenderStability(page);

      const bg = await page.evaluate(() => {
        const wrapper = document.querySelector(".rounded-b-md.overflow-x-auto");
        return wrapper ? globalThis.getComputedStyle(wrapper).backgroundColor : null;
      });
      expect(bg).toBe("rgba(0, 0, 0, 0)");
    },
  ),

  // ── T7b: Bug E — React-driven resize ────────────────────────────────────

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "resize handle (cursor-ns-resize) is present on a typescript code block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      await expect(page.locator(".cursor-ns-resize")).toHaveCount(1);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "dragging the handle upward shrinks the block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");

      const ta = getCodeTextarea(page);
      await ta.fill(Array.from({ length: 20 }, (_, i) => `const line${i} = ${i};`).join("\n"));
      await waitForRenderStability(page);

      const getSourceHeight = () =>
        page.evaluate(() => {
          const ta = document.querySelector('textarea[placeholder="Code…"]');
          return ta?.parentElement?.offsetHeight ?? 0;
        });

      const before = await getSourceHeight();

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 120, { steps: 10 });
      await page.mouse.up();
      await waitForRenderStability(page);

      const after = await getSourceHeight();
      expect(after).toBeLessThan(before);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "dragging to minimum stops at 3 lines (96px)",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 600, { steps: 20 });
      await page.mouse.up();
      await waitForRenderStability(page);

      const height = await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        return ta?.parentElement?.offsetHeight ?? 0;
      });
      expect(height).toBeGreaterThanOrEqual(96);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "heightLines persists after page reload",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const uniqueTitle = `resize-persist-${Date.now().toString(36)}`;
      await page.getByRole("textbox", { name: "Page title" }).fill(uniqueTitle);
      await insertCodeBlock(page, "typescript");

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 120, { steps: 10 });
      await page.mouse.up();
      await waitForRenderStability(page);

      const heightBefore = await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        return ta?.parentElement?.offsetHeight ?? 0;
      });

      await page.reload({ waitUntil: "networkidle" });
      const sidebarEntry = page.locator("nav button").filter({ hasText: uniqueTitle }).first();
      await sidebarEntry.waitFor({ state: "visible", timeout: 15_000 });
      await sidebarEntry.click();
      await getCodeTextarea(page).waitFor({ state: "visible", timeout: 10_000 });
      await waitForRenderStability(page);

      const heightAfter = await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        return ta?.parentElement?.offsetHeight ?? 0;
      });
      expect(heightAfter).toBe(heightBefore);
    },
    { serial: true },
  ),

  // ── T7b: Bug F — resize handle in mermaid preview ────────────────────────

  defineScenario(
    "7b. Code block followups",
    "Bug F: handle in mermaid preview",
    "resize handle is visible on a mermaid block in preview mode",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await expect(page.locator('button[title="Show source"]')).toBeVisible();
      await expect(page.locator(".cursor-ns-resize")).toHaveCount(1);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug F: handle in mermaid preview",
    "dragging the handle in mermaid preview mode applies a live height constraint",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await waitForRenderStability(page);

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 100, { steps: 10 });

      const wrapperHeightDuringDrag = await page.evaluate(() => {
        const handleEl = document.querySelector(".cursor-ns-resize");
        const body = handleEl?.closest(".rounded-md")?.querySelector(".p-0");
        return body?.firstElementChild?.style?.height ?? "";
      });

      await page.mouse.up();

      expect(wrapperHeightDuringDrag).toMatch(/^\d+px$/);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug F: handle in mermaid preview",
    "resize handle remains visible after toggling source then back to preview",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await page.locator('button[title="Show source"]').click();
      await waitForRenderStability(page);
      await page.locator('button[title="Show preview"]').click();
      await waitForRenderStability(page);
      await expect(page.locator(".cursor-ns-resize")).toHaveCount(1);
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "content is scrollable inside a source block resized to minimum",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      const ta = getCodeTextarea(page);
      await ta.fill(Array.from({ length: 20 }, (_, i) => `const line${i} = ${i};`).join("\n"));
      await waitForRenderStability(page);

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 600, { steps: 20 });
      await page.mouse.up();
      await waitForRenderStability(page);

      const scrollable = await page.evaluate(() => {
        const textarea = document.querySelector('textarea[placeholder="Code…"]');
        return textarea ? textarea.scrollHeight > textarea.clientHeight : false;
      });
      expect(scrollable).toBe(true);
    },
  ),
];
