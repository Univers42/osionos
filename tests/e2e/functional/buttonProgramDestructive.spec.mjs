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
const trash = { op: "action", action: { type: "page_action", name: "move_to_trash" } };
const after = { op: "action", action: { type: "notify", message: "after-trash" } };

async function seed(page, baseURL, program) {
  await page.addInitScript(({ program, ws }) => {
    if (sessionStorage.getItem("button-seeded") !== null) return;
    sessionStorage.setItem("button-seeded", "1");
    const base = { workspaceId: ws, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };
    const button = { id: "b1", type: "button", content: "Run it", buttonLabel: "Run it", buttonProgram: program };
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{ ...base, _id: "btn-host", title: "Button host", content: [button] }]));
    localStorage.setItem("pg:recents", "[]");
  }, { program, ws: WS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Button host").click();
}

function watchWrites(page) {
  const writes = [];
  page.on("request", (request) => {
    if (/\/api\/pages\//.test(request.url()) && request.method() !== "GET") writes.push(request.method());
  });
  return writes;
}

test.describe("button program: destructive steps", () => {
  test("the confirmation appears before the destructive step, and names the action", async ({ page, baseURL }) => {
    const writes = watchWrites(page);
    await seed(page, baseURL, { version: 1, steps: [trash] });
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    const dialog = page.getByText("This button wants to run");
    await expect(dialog).toBeVisible();
    await expect(page.getByText("move_to_trash", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(0);
  });

  test("cancelling leaves the page untouched and stops the run", async ({ page, baseURL }) => {
    const writes = watchWrites(page);
    await seed(page, baseURL, { version: 1, steps: [trash, after] });
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("This button wants to run")).toHaveCount(0);
    await expect(page.getByText("after-trash")).toHaveCount(0);
    await expect(explorerRow(page, "Button host")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run it", exact: true })).toBeVisible();
    expect(writes).toHaveLength(0);
  });
});
