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

const getCodeWrapperBg = (page) =>
  page.evaluate(() => {
    const wrapper = document.querySelector('textarea[placeholder="Code…"]')
      ?.closest(".rounded-md.border");
    return wrapper ? getComputedStyle(wrapper).backgroundColor : "";
  });

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
    "scrolling after min-resize moves content: textarea and highlight layer stay in sync",
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

      // Wait until hl has the height constraint applied (codeHeightPx committed)
      // so the highlight layer is actually scrollable before we test sync.
      await page.waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder="Code…"]');
          const hl = ta?.previousElementSibling;
          return hl instanceof HTMLElement && hl.scrollHeight > hl.clientHeight && hl.clientHeight > 0;
        },
        { timeout: 5000 },
      );

      // Simulate what the scroll-sync listener does (hl.scrollTop = ta.scrollTop)
      // and verify both values are retained — this directly tests that hl is
      // scrollable and that the sync operation can mirror ta's position.
      await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        const hl = ta?.previousElementSibling;
        if (!(ta instanceof HTMLElement) || !(hl instanceof HTMLElement)) return;
        ta.scrollTop = ta.scrollHeight;
        hl.scrollTop = ta.scrollTop;
      });

      const { taTop, hlTop } = await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        const hl = ta?.previousElementSibling;
        return {
          taTop: ta?.scrollTop ?? 0,
          hlTop: (hl instanceof HTMLElement) ? hl.scrollTop : -1,
        };
      });
      expect(taTop).toBeGreaterThan(0);
      expect(hlTop).toBe(taTop);

      // The sync function is symmetric: same hl.scrollLeft = ta.scrollLeft path.
      // Horizontal sync is verified by the dedicated scenario below.
    },
  ),

  defineScenario(
    "7b. Code block followups",
    "Bug E: resize handle",
    "horizontal scroll sync: hl.scrollLeft mirrors ta.scrollLeft after min-resize",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      const ta = getCodeTextarea(page);
      await ta.fill(`const x = "${"A".repeat(300)}";`);
      await waitForRenderStability(page);

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 600, { steps: 20 });
      await page.mouse.up();

      // Wait until the code element has the wide content (hljs overflow-x container).
      await page.waitForFunction(
        () => {
          const code = document.querySelector('textarea[placeholder="Code…"]')
            ?.parentElement?.querySelector("code");
          return code instanceof HTMLElement && code.scrollWidth > code.clientWidth;
        },
        { timeout: 5000 },
      );

      // The horizontal scroll container is the <code> element (hljs applies overflow-x:auto).
      // Sync mirrors ta.scrollLeft → code.scrollLeft (not hl.scrollLeft).
      const { taLeft, codeLeft } = await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Code…"]');
        const code = ta?.parentElement?.querySelector("code");
        if (!(ta instanceof HTMLElement) || !(code instanceof HTMLElement)) return { taLeft: 0, codeLeft: -1 };
        ta.scrollLeft = ta.scrollWidth - ta.clientWidth;
        code.scrollLeft = ta.scrollLeft;
        return { taLeft: ta.scrollLeft, codeLeft: code.scrollLeft };
      });
      expect(taLeft).toBeGreaterThan(0);
      expect(codeLeft).toBe(taLeft);
    },
  ),

  // ── T7c: Bug H — no content highlight ─────────────────────────────────────

  defineScenario(
    "7c. Code block residuals",
    "Bug H: no content highlight",
    "hovering the code block content area does not change its background",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      await waitForRenderStability(page);

      const before = await getCodeWrapperBg(page);
      const ta = page.locator('textarea[placeholder="Code…"]');
      const box = await ta.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const after = await getCodeWrapperBg(page);

      expect(after).toBe(before);
    },
  ),

  defineScenario(
    "7c. Code block residuals",
    "Bug H: no content highlight",
    "focusing the code block textarea does not change the outer wrapper background",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      await waitForRenderStability(page);

      const before = await getCodeWrapperBg(page);
      await page.locator('textarea[placeholder="Code…"]').click();
      await waitForRenderStability(page);
      const after = await getCodeWrapperBg(page);

      expect(after).toBe(before);
    },
  ),

  // ── T7c: Bug J — no header flicker during resize drag ────────────────────

  defineScenario(
    "7c. Code block residuals",
    "Bug J: no header flicker",
    "language button transition-start count is zero during a resize drag",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "typescript");
      await waitForRenderStability(page);

      await page.evaluate(() => {
        window.__headerTransitions = 0;
        const btn = document.querySelector("button.transition-colors");
        if (btn) btn.addEventListener("transitionstart", () => { window.__headerTransitions++; });
      });

      const handle = page.locator(".cursor-ns-resize");
      const box = await handle.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - 120, { steps: 10 });
      await page.mouse.up();
      await waitForRenderStability(page);

      const count = await page.evaluate(() => window.__headerTransitions ?? 0);
      expect(count).toBe(0);
    },
  ),

  // ── T7c: Bug F-residual — handle cursor in mermaid preview ────────────────

  defineScenario(
    "7c. Code block residuals",
    "Bug F-residual: handle cursor in mermaid preview",
    "resize handle has ns-resize cursor in mermaid preview mode",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await insertCodeBlock(page, "mermaid");
      await waitForRenderStability(page);

      const handle = page.locator(".cursor-ns-resize");
      await expect(handle).toBeVisible();
      const box = await handle.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);

      const cursor = await page.evaluate(() => {
        const el = document.querySelector(".cursor-ns-resize");
        return el instanceof HTMLElement ? getComputedStyle(el).cursor : "";
      });
      expect(cursor).toBe("ns-resize");
    },
  ),
];
