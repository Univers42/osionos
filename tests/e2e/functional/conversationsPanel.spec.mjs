/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   conversationsPanel.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 07:05:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 07:05:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One Conversations space: AI chats and agents, channels and direct messages,
// one filter over all of them. The offline build has no chat bridge, so the
// channel and DM lists stay out; the AI section is local and fully testable.

import { expect, test } from "@playwright/test";

const panel = (page) => page.locator('[data-sidebar-panel="conversations"]');

async function seedChats(page, titles) {
  await page.evaluate(async (names) => {
    const { useChatStore } = await import("/src/features/chat/model/useChatStore.ts");
    const store = useChatStore.getState();
    for (const name of names) store.renameConversation(store.createConversation().id, name);
  }, titles);
}

test.describe("conversations panel", () => {
  test("Ctrl+Alt+M opens it with focus in the filter; the filter and the chips narrow what is shown", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.getByText("Explorer", { exact: true }).waitFor();
    await seedChats(page, ["Quarterly plan", "Recipe ideas"]);

    await page.locator("main").click({ position: { x: 400, y: 300 } });
    await page.keyboard.press("Control+Alt+m");
    await expect(panel(page)).toBeVisible();
    await expect(page.getByLabel("Filter conversations")).toBeFocused();
    await expect(panel(page).getByRole("button", { name: "Quarterly plan" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Recipe ideas" })).toBeVisible();

    await page.keyboard.type("recipe");
    await expect(panel(page).getByRole("button", { name: "Recipe ideas" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Quarterly plan" })).toHaveCount(0);

    await panel(page).getByRole("radio", { name: "Channels" }).click();
    await expect(panel(page).getByRole("region", { name: "AI" })).toHaveCount(0);
    await panel(page).getByRole("radio", { name: "AI" }).click();
    await expect(panel(page).getByRole("region", { name: "AI" })).toBeVisible();
  });

  test("New AI chat opens a chat tab", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.getByText("Explorer", { exact: true }).waitFor();
    await page.getByRole("tab", { name: /^Conversations/ }).click();
    await panel(page).getByRole("button", { name: "New AI chat" }).click();
    await expect(page.locator("[data-tab-id]").filter({ hasText: "Assistant" })).toHaveCount(1);
  });
});
