/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeDashboardEdits.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Home dashboard is client-local: the page the user edits never reaches the
// server, it lives in the localStorage cache. The re-seed used to overwrite it
// whenever the page looked "stale" — and a deleted dashboard section made it
// look stale, so the user's own blocks were gone on the next reload.

import { expect, test } from "@playwright/test";

/** The rail's Home button: it opens the home-surface menu. */
function railHome(page) {
  return page.locator('[role="tab"][aria-label="Home"]');
}

/** One seeded Home block, by the id the seed gives it. */
function homeBlock(page, idSuffix) {
  return page.locator(`[data-draggable-block-id$="${idSuffix}"]`);
}

async function openHome(page) {
  await railHome(page).click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await expect(homeBlock(page, "block-greeting")).toBeVisible();
}

async function deleteHomeBlock(page, idSuffix) {
  const block = homeBlock(page, idSuffix);
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  await block.locator('> [data-testid="block-drag-handle"]').click();
  await page.getByTestId("block-context-menu").getByRole("menuitem", { name: /^Delete\b/ }).click();
  await expect(block).toHaveCount(0);
}

/** The page cache is the Home's only home: the note is saved when it lands there. */
async function cacheHolds(page, needle) {
  return page.evaluate(
    (text) => Object.entries(localStorage).some(([, value]) => value.includes(text)),
    needle,
  );
}

test.describe("home dashboard edits", () => {
  test("the user's own Home blocks survive a reload, and the page is not re-seeded", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await openHome(page);

    // The user writes a paragraph of their own, right under the greeting.
    const greeting = homeBlock(page, "block-greeting");
    await greeting.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("My own home note");
    await expect(page.getByText("My own home note")).toBeVisible();
    await expect.poll(() => cacheHolds(page, "My own home note")).toBe(true);

    // The user deletes two dashboard sections, title and body each. The old
    // re-seed counted the section bodies and called a page with fewer than
    // four "stale", so two deletions are what used to throw the user's own
    // blocks away.
    await deleteHomeBlock(page, "home-learn-block-db");
    await deleteHomeBlock(page, "home-learn-block-title");
    await deleteHomeBlock(page, "home-events-block-db");
    await deleteHomeBlock(page, "home-events-block-title");

    // A reload: the page comes back from the local cache.
    await page.reload();
    await openHome(page);

    await expect(page.getByText("My own home note")).toBeVisible();
    await expect(homeBlock(page, "home-learn-block-title")).toHaveCount(0);
    await expect(homeBlock(page, "home-events-block-title")).toHaveCount(0);

    // A second reload: the page is not re-seeded again.
    await page.reload();
    await openHome(page);

    await expect(page.getByText("My own home note")).toBeVisible();
    await expect(homeBlock(page, "home-learn-block-title")).toHaveCount(0);
    await expect(homeBlock(page, "home-events-block-title")).toHaveCount(0);
  });

  test("a re-seed of the Home keeps the user's own blocks", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await openHome(page);

    // The user writes a paragraph of their own and deletes a section.
    const greeting = homeBlock(page, "block-greeting");
    await greeting.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("My own home note");
    await expect(page.getByText("My own home note")).toBeVisible();
    await expect.poll(() => cacheHolds(page, "My own home note")).toBe(true);
    await deleteHomeBlock(page, "home-learn-block-db");
    await deleteHomeBlock(page, "home-learn-block-title");

    // The next load re-seeds the Home, the way a deliberate seed bump does:
    // the cached page carries an old seed version.
    await page.addInitScript(() => {
      for (const [key, value] of Object.entries(localStorage)) {
        if (!key.startsWith("osio:pages:")) continue;
        let pages;
        try {
          pages = JSON.parse(value);
        } catch {
          continue;
        }
        if (!Array.isArray(pages)) continue;
        const home = pages.find((entry) => typeof entry?._id === "string" && entry._id.startsWith("home-dashboard:"));
        if (!home) continue;
        home.homeDashboardVersion = 0;
        localStorage.setItem(key, JSON.stringify(pages));
      }
    });
    await page.reload();
    await openHome(page);

    // The re-seed merged: the user's own blocks are still there, and the
    // section they deleted is still gone.
    await expect(page.getByText("My own home note")).toBeVisible();
    await expect(homeBlock(page, "home-learn-block-title")).toHaveCount(0);
    await expect(homeBlock(page, "home-learn-block-db")).toHaveCount(0);
    // The seed's own blocks are back in place (the merge replaced them).
    await expect(homeBlock(page, "home-events-block-db")).toHaveCount(1);
  });
});
