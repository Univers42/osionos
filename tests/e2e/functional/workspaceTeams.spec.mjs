/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceTeams.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

const region = (page) => page.getByRole("region", { name: "Settings", exact: true });

test.describe("the teams block of the Teamspaces settings page", () => {
  test("shows the empty state, then a created team as a row", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) consoleErrors.push(message.text());
    });

    await page.goto(new URL("/?settings=teamspaces#teams", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(r.getByRole("heading", { name: "Teams", exact: true })).toBeVisible();
    await expect(r.getByText("No teams yet")).toBeVisible();

    await r.getByLabel("New team name").fill("Design");
    await r.getByRole("button", { name: "Create team" }).click();

    await expect(r.getByLabel("Team name", { exact: true })).toHaveValue("Design");
    await expect(r.getByText("No teams yet")).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
