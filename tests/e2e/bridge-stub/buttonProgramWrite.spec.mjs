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

import { notify, setProperty, program, button, seed, cachedProperties } from "../support/buttonProgramSeed.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

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
