/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visibleWhen.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage, activateFirstEditor, waitForRenderStability } from "../../browser/core/app.mjs";

async function seedStatusProperty(page, value = "") {
  await page.evaluate(async (value) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    store.patchPage(store.activePage?.id, { properties: [{ key: "status", label: "Status", type: "text", value }] });
  }, value);
  await waitForRenderStability(page);
}

async function setStatus(page, value) {
  await page.evaluate(async (value) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    store.patchPage(store.activePage?.id, { properties: [{ key: "status", label: "Status", type: "text", value }] });
  }, value);
  await waitForRenderStability(page);
}

async function lockPage(page) {
  await page.evaluate(async () => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const { useUserStore } = await import("/src/features/auth/model/useUserStore.ts");
    const { usePageConfigStore } = await import("/src/shared/config/pageConfigStore.ts");
    const pageId = usePageStore.getState().activePage?.id;
    const userId = useUserStore.getState().activeUserId || "anonymous";
    await usePageConfigStore.getState().updateConfig(userId, pageId, { locked: true });
  });
  await waitForRenderStability(page);
}

test.describe("visibleWhen on any block", () => {
  test("edit shows hidden-by-rule; view hides then shows on status active", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await seedStatusProperty(page, "");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("Hello");
    await waitForRenderStability(page);

    const block = page.locator("[data-block-id]").first();
    await block.click({ button: "right" });
    await page.getByText("Show when…", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Show when" });
    await expect(dialog).toBeVisible();
    const input = dialog.locator('input[aria-label="Visibility formula"]');
    await input.fill('prop("status") == "active"');
    await input.blur();
    await waitForRenderStability(page);

    const hiddenBlock = page.locator("[data-hidden-by-rule]").first();
    await expect(hiddenBlock).toBeVisible();
    await expect(hiddenBlock).toContainText("Hidden by rule");

    await lockPage(page);
    await expect(page.locator("[data-hidden-by-rule]")).toHaveCount(0);
    await expect(page.getByText("Hello")).toHaveCount(0);

    await page.evaluate(async () => {
      // unlock by reloading? Instead set status via store while locked view reads page store
    });
    await setStatus(page, "active");
    await expect(page.getByText("Hello")).toBeVisible();
  });

  test("invalid formula shows Check error and block stays visible", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await seedStatusProperty(page, "");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("Hello");
    await waitForRenderStability(page);

    const block = page.locator("[data-block-id]").first();
    await block.click({ button: "right" });
    await page.getByText("Show when…", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Show when" });
    await expect(dialog).toBeVisible();
    const input = dialog.locator('input[aria-label="Visibility formula"]');
    await input.fill("prop(");
    await dialog.getByRole("button", { name: "Check" }).click();
    await expect(dialog.getByRole("status")).toContainText(/Unexpected token/);
    await input.blur();
    await waitForRenderStability(page);
    // block stays visible (no data-hidden-by-rule)
    await expect(page.locator("[data-hidden-by-rule]")).toHaveCount(0);
    await expect(page.getByText("Hello")).toBeVisible();
  });
});