/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonProgramEditor.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { BUTTON_WS as WS, seedButtonPage as seed } from "../support/buttonProgramSeed.mjs";

const HOSTILE = '<img src=x onerror="window.__xss = 1">';
const notify = (message) => ({ op: "action", action: { type: "notify", message } });
const program = (steps) => ({ version: 1, steps });
const button = (extra) => ({ id: "b1", type: "button", content: "Run it", buttonLabel: "Run it", ...extra });

async function openSettings(page) {
  await page.getByRole("button", { name: "Run it", exact: true }).click({ button: "right" });
  await page.getByText("Button settings", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Button settings" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const cachedButton = (page) =>
  page.evaluate((ws) => JSON.parse(localStorage.getItem(`osio:pages:${ws}`) ?? "[]").find((p) => p._id === "btn-host")?.content?.find((b) => b.id === "b1"), WS);

test.describe("button program editor", () => {
  test("the settings popover opens from the block menu and closes on Escape", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({})]);
    const dialog = await openSettings(page);
    await expect(dialog.getByLabel("Button label")).toHaveValue("Run it");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a step can be added and removed", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({})]);
    const dialog = await openSettings(page);
    await expect(dialog.getByText("No steps yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Add step" }).click();
    await expect(dialog.locator("[data-step-op]")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Remove step" }).click();
    await expect(dialog.locator("[data-step-op]")).toHaveCount(0);
  });

  test("Save persists the label and the program across a reload", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({})]);
    const dialog = await openSettings(page);
    await dialog.getByLabel("Button label").fill("Ship it");
    await dialog.getByRole("button", { name: "Add step" }).click();
    await dialog.getByLabel("Message", { exact: true }).fill("shipped");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await explorerRow(page, "Button host").click();
    await expect(page.getByRole("button", { name: "Ship it", exact: true })).toBeVisible();
    expect((await cachedButton(page)).buttonProgram).toEqual(program([notify("shipped")]));
  });

  test("an invalid draft is refused and nothing is saved", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({})]);
    const dialog = await openSettings(page);
    await dialog.getByLabel("New step kind").selectOption("set");
    await dialog.getByRole("button", { name: "Add step" }).click();
    await dialog.getByLabel("Variable name").fill("has space");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("steps[0].name");
    expect((await cachedButton(page)).buttonProgram).toBeUndefined();
  });

  test("the code view shows the program and is not editable", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({ buttonProgram: program([notify("hi")]) })]);
    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "Show code" }).click();
    const code = dialog.getByTestId("button-code-view");
    await expect(code).toContainText('"version": 1');
    await expect(code).toContainText('"message": "hi"');
    await expect(code.locator("textarea, input, [contenteditable]")).toHaveCount(0);
  });

  test("the code view renders hostile text as literal text", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({ buttonProgram: program([notify(HOSTILE)]) })]);
    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "Show code" }).click();
    const code = dialog.getByTestId("button-code-view");
    await expect(code).toContainText("<img src=x onerror=");
    await expect(code.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__xss)).toBeUndefined();
  });

  test("the run log lists the steps of the last run, in order", async ({ page, baseURL }) => {
    const set = { op: "set", name: "x", value: 1 };
    await seed(page, baseURL, [button({ buttonProgram: program([notify("one"), set, notify("two")]) })]);
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await expect(page.getByText("one", { exact: true })).toBeVisible();
    const dialog = await openSettings(page);
    await expect(dialog.getByRole("list", { name: "Run log" }).getByRole("listitem")).toHaveText([
      "Notify: ok",
      "Set `x`: ok",
      "Notify: ok",
    ]);
  });
});
