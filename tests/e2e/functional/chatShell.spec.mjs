/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chatShell.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

const composer = (page) => page.getByPlaceholder("Do anything with AI…");

async function openAssistant(page) {
  // The assistant is reachable from the rail "Assistant" icon and the sidebar
  // "New agent" button; the latter is always visible, so drive the test with it.
  const newAgent = page.getByRole("button", { name: "New agent" });
  await newAgent.first().waitFor({ timeout: 20_000 });
  await newAgent.first().click();
}

test.describe("chat-shell", () => {
  test("clicking the assistant opens a fresh conversation (hero + composer)", async ({ page }) => {
    await page.goto("/");
    await openAssistant(page);
    await expect(page.getByText("How can I help you today?")).toBeVisible({ timeout: 15_000 });
    await expect(composer(page)).toBeVisible();
  });

  test("talking without a connection prompts setup, then sends after connecting", async ({ page }) => {
    await page.goto("/");
    await openAssistant(page);
    await composer(page).fill("hello assistant");
    await composer(page).press("Enter");

    // Guided onboarding instead of a silent send.
    await expect(page.getByText(/haven.?t set up a connection/i)).toBeVisible();
    await page.getByRole("button", { name: "Yes, connect" }).click();
    await expect(page.getByText(/Which provider/i)).toBeVisible();
    // The onboarding "Connect" lives inside the dialog (not the composer's Connect).
    await page.getByRole("dialog").getByRole("button", { name: "Connect", exact: true }).first().click();

    // Once connected, the pending message auto-sends → user + stub assistant turns.
    await expect(page.getByTestId("chat-thread")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-role="user"]')).toContainText("hello assistant");
    await expect(page.locator('[data-role="assistant"]')).toContainText("[stub] connector=");

    const stored = await page.evaluate(() => localStorage.getItem("osionos.chat.v1"));
    expect(stored ?? "").toContain("hello assistant");
  });

  test("connect Claude via OAuth (no API key) surfaces its models in the picker", async ({ page }) => {
    await page.goto("/");
    await openAssistant(page);

    const claude = page.getByRole("button", { name: /Claude \(sign in\)/ });
    await expect(claude).toBeVisible();
    await claude.click();

    // Consent: scopes shown, no API key required.
    await expect(page.getByText(/no.*API key required/i)).toBeVisible();
    await page.getByRole("button", { name: "Authorize" }).click();

    // Connected → the chip is active and the connector's models join the picker.
    await expect(page.getByRole("button", { name: "Claude (sign in)" })).toHaveAttribute("title", "Disconnect");
    await page.getByTestId("model-picker").getByRole("combobox").click(); // open the model picker
    await expect(page.getByText("Claude Opus 4.8")).toBeVisible({ timeout: 10_000 });
  });
});
