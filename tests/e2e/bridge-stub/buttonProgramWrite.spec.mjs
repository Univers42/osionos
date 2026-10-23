/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonProgramWrite.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

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
  bodies.armed = false;
  await stubBridge(page, (url, request) => {
    if (request.method() !== "PATCH" || !url.pathname.startsWith("/api/pages/")) return undefined;
    if (url.pathname.endsWith("/btn-host") && bodies.armed) bodies.push({ body: request.postDataJSON(), auth: request.headers().authorization });
    return { status, json: { version: 1 } };
  });
  return bodies;
}

const cachedProperties = (page) =>
  page.evaluate((ws) => JSON.parse(localStorage.getItem(`osio:pages:${ws}`) ?? "[]").find((p) => p._id === "btn-host")?.properties, WS);
const program = (steps) => ({ version: 1, steps });
const button = (extra) => ({ id: "b1", type: "button", content: "Run it", buttonLabel: "Run it", ...extra });

test.describe("button program writes", () => {
  test("a click runs the program: 3 notifies, one merged write with the clicker's token, exact value after a reload", async ({ page, baseURL }) => {
    const bodies = await answerPatches(page);
    await seed(page, baseURL, [button({ buttonProgram: program([
      { op: "repeat", count: 3, steps: [notify("tick")] },
      setProperty("Score", { formula: 'prop("Base") + 1' }),
    ]) })]);
    bodies.armed = true;
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await expect(page.getByText("tick")).toHaveCount(3);
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].auth).toBe("Bearer e2e-page-jwt");
    expect(bodies[0].body.properties.map((p) => p.key)).toEqual(["Base", "Owner", "Done", "Score"]);
    expect(bodies[0].body.properties.find((p) => p.key === "Score")).toMatchObject({ label: "Score", type: "number", value: 42 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await cachedProperties(page))?.map((p) => [p.key, p.value])).toEqual([
      ["Base", 41], ["Owner", "dylan"], ["Done", false], ["Score", 42],
    ]);
  });
  test("a refused write (403) is blocked and leaves the local page unchanged", async ({ page, baseURL }) => {
    const bodies = await answerPatches(page, 403);
    await seed(page, baseURL, [button({ buttonProgram: program([setProperty("Owner", "intruder")]) })]);
    bodies.armed = true;
    await page.getByRole("button", { name: "Run it", exact: true }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect((await cachedProperties(page)).find((p) => p.key === "Owner").value).toBe("dylan");
  });
  test("a double click runs the program once", async ({ page, baseURL }) => {
    const bodies = await answerPatches(page);
    await seed(page, baseURL, [button({ buttonProgram: program([setProperty("Owner", "once")]) })]);
    bodies.armed = true;
    await page.getByRole("button", { name: "Run it", exact: true }).dblclick();
    await expect.poll(() => bodies.length).toBe(1);
    await page.waitForTimeout(500);
    expect(bodies).toHaveLength(1);
  });
});
