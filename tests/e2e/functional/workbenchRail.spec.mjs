/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchRail.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
// Source Control / Run / Problems join the activity rail.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const PANELS = ["Source Control", "Run", "Problems"];
const RAIL = { name: "Activity bar" };

async function open(page, baseURL, { persistedPanel }) {
  await page.addInitScript(
    ({ persistedPanel: panel }) => {
      try {
        if (panel) {
          localStorage.setItem("ui-storage", JSON.stringify({ state: { activePanel: panel }, version: 1 }));
        }
      } catch {
        /* ignore */
      }
    },
    { persistedPanel },
  );
  await openFreshPage(page, baseURL);
  await page.locator(".osionos-page").first().waitFor({ state: "visible", timeout: 20_000 });
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    // Same filter as workbench.spec.mjs: a backend that is configured (.env) but not running in
    // the e2e container fails at the network layer — that is not a render error of a panel.
    if (msg.type() === "error" && !/Failed to load resource|ERR_|net::/i.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test("each rail panel shows its title and renders without errors", async ({ page, baseURL }) => {
  const errors = collectErrors(page);
  await open(page, baseURL, { persistedPanel: undefined });
  // The rail sits beside the panel, so every Workbench tab is reachable directly.
  const rail = page.getByRole("tablist", RAIL);

  for (const name of PANELS) {
    const button = rail.getByRole("tab", { name, exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator("span[data-panel-title]", { hasText: name })).toBeVisible();
    await page.waitForTimeout(500); // lazy panel chunk + first render
  }
  expect(errors).toEqual([]);
});
