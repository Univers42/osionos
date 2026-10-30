/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   a11yAudit.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// WCAG 2.x A + AA, as axe-core checks it, on the surfaces every user meets (#224).
// Caveat: axe proves the absence of the machine-checkable failures only — roughly a third
// of the RGAA criteria. Keyboard order, meaningful alternatives and reading order still
// need a human pass; a green run here is not an AA claim.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createParagraphs, openFreshPage, openPageMenuPanel } from "../../browser/core/app.mjs";
import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page, include) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_AA);
  if (include) builder.include(include);
  const { violations: found } = await builder.analyze();
  return found.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1] ?? ""}`),
    count: v.nodes.length,
  }));
}

const GRID_OWNS = {
  grid: ["rowgroup", "row"],
  rowgroup: ["row"],
  row: ["gridcell", "columnheader", "rowheader"],
};
const TRANSPARENT = new Set(["generic", "none", "presentation"]);

/** What Chrome's own accessibility tree puts where a grid allows only rows and cells. axe
 *  models every <tr> as a row, but Chrome drops a role-less row of a presentational table
 *  into the grid: its buttons became direct children of the grid (#224, measured). */
async function gridStructureFaults(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const faults = [];
  const owned = (node) => (node.childIds ?? []).flatMap((id) => {
    const child = byId.get(id);
    if (!child) return [];
    return child.ignored || TRANSPARENT.has(child.role?.value) ? owned(child) : [child];
  });
  const check = (node) => {
    const role = node.role.value;
    for (const child of owned(node)) {
      const childRole = child.role?.value;
      if (!GRID_OWNS[role].includes(childRole)) faults.push(`${role} > ${childRole} "${child.name?.value ?? ""}"`);
      else if (GRID_OWNS[childRole]) check(child);
    }
  };
  const grids = nodes.filter((node) => node.role?.value === "grid" && !node.ignored);
  grids.forEach(check);
  return { grids: grids.length, faults };
}

for (const theme of ["light", "dark"]) {
  test.describe(`WCAG AA, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
    });

    test("a page with text has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await createParagraphs(page, ["First paragraph", "Second paragraph"]);
      expect(await violations(page)).toEqual([]);
    });

    test("the slash menu has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await createParagraphs(page, ["x"]);
      await page.keyboard.press("End");
      await page.keyboard.type("/");
      await expect(page.getByRole("listbox").or(page.getByRole("menu")).first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the settings pane has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.getByRole("button", { name: /settings/i }).first().click();
      await expect(page.getByRole("button", { name: "Preferences" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the page menu has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await openPageMenuPanel(page, "appearance");
      expect(await violations(page)).toEqual([]);
    });

    test("an inline database has no AA violation", async ({ page }) => {
      const block = await insertInlineDatabase(page);
      await expect(block.locator('[aria-label="Add property"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      expect(await gridStructureFaults(page)).toEqual({ grids: 1, faults: [] });
    });

    test("the search palette has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.getByRole("combobox", { name: "Search pages or run a command" }).fill("Getting");
      await expect(page.getByRole("option").first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the marketplace has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.getByRole("button", { name: "Marketplace", exact: true }).first().click();
      await expect(page.getByRole("region", { name: "Marketplace" }).or(page.getByRole("tab", { name: /Marketplace/ })).first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
