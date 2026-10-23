/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonProgram.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";

const WS = "mock-ws-private-0";
const notify = (message) => ({ op: "action", action: { type: "notify", message } });
const setProperty = (property, value) => ({ op: "action", action: { type: "set_property", property, value } });
const PROPERTIES = [
  { key: "Base", label: "Base", type: "number", value: 41 },
  { key: "Owner", label: "Owner", type: "text", value: "dylan" },
  { key: "Done", label: "Done", type: "checkbox", value: false },
];

// Seeded once per tab (a reload must not undo what a persistence check reads).
async function seed(page, baseURL, buttons) {
  await page.addInitScript(({ buttons, properties, ws }) => {
    if (sessionStorage.getItem("button-seeded") !== null) return;
    sessionStorage.setItem("button-seeded", "1");
    const base = { workspaceId: ws, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([
      { ...base, _id: "btn-host", title: "Button host", properties, content: buttons },
      { ...base, _id: "btn-target", title: "Button target", content: [] },
    ]));
    localStorage.setItem("pg:recents", "[]");
  }, { buttons, properties: PROPERTIES, ws: WS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Button host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

// Answers the page PATCH with `status`, recording each request body.
async function answerPatches(page, status = 200) {
  const bodies = [];
  await page.route("**/api/pages/*", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    bodies.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({ status, json: { version: 1 } });
  });
  return bodies;
}

const cachedProperties = (page) =>
  page.evaluate((ws) => JSON.parse(localStorage.getItem(`osio:pages:${ws}`) ?? "[]").find((p) => p._id === "btn-host")?.properties, WS);
const program = (steps) => ({ version: 1, steps });
const button = (extra) => ({ id: "b1", type: "button", content: "Run it", buttonLabel: "Run it", ...extra });

test.describe("button program", () => {
  test("the block is a button, not an editable paragraph", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({ buttonProgram: program([]) })]);
    await expect(page.getByRole("button", { name: "Run it", exact: true })).toBeVisible();
    await expect(page.locator('[contenteditable="true"]').filter({ hasText: "Run it" })).toHaveCount(0);
  });


  test("an invalid program toasts and changes nothing", async ({ page, baseURL }) => {
    const bodies = await answerPatches(page);
    await seed(page, baseURL, [button({ buttonProgram: { version: 1, steps: [{ op: "launch" }] }, buttonHref: "page://btn-target" })]);
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await expect(page.getByText("This button's program is invalid")).toBeVisible();
    expect(bodies).toHaveLength(0);
    await expect(explorerRow(page, "Button host")).toBeVisible();
  });

  test("a block without a program keeps opening its page:// target", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({ buttonHref: "page://btn-target" })]);
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Button target");
  });

  test("a click runs the program's notifies once, a double click does not run it twice", async ({ page, baseURL }) => {
    await seed(page, baseURL, [button({ buttonProgram: program([notify("tick")]) })]);
    await page.getByRole("button", { name: "Run it", exact: true }).dblclick();
    await expect(page.getByText("tick")).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(page.getByText("tick")).toHaveCount(1);
  });
});
