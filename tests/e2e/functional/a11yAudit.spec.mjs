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

import { createParagraphs, openFreshPage } from "../../browser/core/app.mjs";

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
  });
}
