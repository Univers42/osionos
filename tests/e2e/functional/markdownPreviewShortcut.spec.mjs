// Ctrl+Shift+V on a .md code page in the app (devil verdict 2026-11-07 editor-page preview, EP11,
// EP12): the app's own shortcut dispatcher must yield the combo to the split, both from Monaco and
// from the focused preview region, and the way back lands in Monaco.
import { expect, test } from "@playwright/test";
import { bootApp } from "../perf/perfHarness.mjs";

test("Ctrl+Shift+V opens the preview of a .md code page and comes back from the focused preview", async ({ page }) => {
  test.setTimeout(180_000); // cold Vite compile of the Monaco chunk
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  await page.evaluate(([name, body]) => globalThis.__perfOpenCodePage(name, body), ["README.md", "# App preview\n\nbody text\n"]);
  // Chrome's Monaco types through an EditContext element; its first textarea is an aria-hidden IME aid.
  const input = page.getByRole("textbox", { name: "Code editor" });
  await input.waitFor({ state: "attached", timeout: 90_000 });
  await page.locator(".monaco-editor .view-lines").first().click();
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview).toHaveCount(0);
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.keyboard.press("Control+Shift+V");
    await expect(preview).toBeFocused();
    await expect(preview.getByRole("heading", { name: "App preview" })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Control+Shift+V");
    await expect(preview).toHaveCount(0);
    await expect(input).toBeFocused();
  }
});
