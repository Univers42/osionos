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
// osio.workbench: Source Control / Run / Problems join the activity rail; with the flag
// off they are absent and a persisted "scm" panel falls back to Explorer.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const PANELS = ["Source Control", "Run", "Problems"];
const RAIL = { name: "Activity bar" };

async function open(page, baseURL, { workbench, persistedPanel }) {
  await page.addInitScript(
    ({ workbench: on, persistedPanel: panel }) => {
      try {
        if (on) localStorage.setItem("osio.workbench", "1");
        if (panel) {
          localStorage.setItem("ui-storage", JSON.stringify({ state: { activePanel: panel }, version: 1 }));
        }
      } catch {
        /* ignore */
      }
    },
    { workbench, persistedPanel },
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

test("workbench on: each rail panel shows its title and renders without errors", async ({ page, baseURL }) => {
  const errors = collectErrors(page);
  await open(page, baseURL, { workbench: true });
  // The app opens with the side panel expanded; the rail shows once it is collapsed.
  await page.getByRole("button", { name: "Collapse to rail" }).click();
  const rail = page.getByRole("tablist", RAIL);

  for (const name of PANELS) {
    const button = rail.getByRole("tab", { name, exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator("span.uppercase", { hasText: name })).toBeVisible();
    await page.waitForTimeout(500); // lazy panel chunk + first render
    await page.getByRole("button", { name: "Collapse to rail" }).click();
  }
  expect(errors).toEqual([]);
});

test("workbench off: no workbench rail buttons; persisted scm falls back to Explorer", async ({ page, baseURL }) => {
  await open(page, baseURL, { workbench: false, persistedPanel: "scm" });

  for (const name of PANELS) {
    await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.locator("span.uppercase", { hasText: "Explorer" })).toBeVisible();
  await expect(page.locator("span.uppercase", { hasText: "Source Control" })).toHaveCount(0);
});
