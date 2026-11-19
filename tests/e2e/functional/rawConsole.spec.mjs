/* ************************************************************************** */
/*                                                                            */
/*   rawConsole.spec.mjs                                                      */
/*                                                                            */
/*   Raw mode's code pane reopens on the text being edited: switching to     */
/*   Preview and back never shows the text raw mode opened with.             */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openPageMenuPanel } from "../../browser/core/app.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const PAGE = [{ id: "intro", type: "paragraph", content: "Intro" }];

const rawView = (page) => page.locator("[data-raw-mode]").filter({ visible: true });
const textarea = (page) => rawView(page).locator('textarea[name="raw-markdown-source"]');

async function openRaw(page, baseURL) {
  await seedPage(page, baseURL, PAGE);
  await (await openPageMenuPanel(page, "more")).getByRole("button", { name: "Raw / code mode" }).click();
  await expect(textarea(page)).toBeVisible();
}

test("the code pane reopens on the text being edited, not the text raw mode opened with", async ({ page, baseURL }) => {
  await openRaw(page, baseURL);
  await textarea(page).fill("Edited before switching");
  await rawView(page).getByRole("button", { name: "Preview", exact: true }).click();
  await expect(textarea(page)).toHaveCount(0);
  await rawView(page).getByRole("button", { name: "Code", exact: true }).click();
  await expect(textarea(page)).toHaveValue("Edited before switching");
});
