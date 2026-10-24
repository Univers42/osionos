// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   unloadedPageBody.spec.mjs                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //
/* global localStorage */

// The page list ships metadata only, so a saved page can be in the store without its body.
// An empty editor there let the next keystroke publish [] + that keystroke over the server's
// body. The page must say why its body is missing instead, and keep its header usable.

import { expect, test } from "@playwright/test";

import { getEditors, openFreshPage } from "../../browser/core/app.mjs";
import { computed, tokenValue } from "../support/styleguideHelpers.mjs";

const REMOTE_ID = "fcf48b5b-2fed-41d6-9c5d-0075988728d1";
const PAGE_CACHE_PREFIX = "osio:pages:";

/** On every load, before the app boots: a saved page whose body never reached this device,
 *  in the workspace of the page the test just created (the one the sidebar shows). */
function addMetadataOnlyPage({ prefix, id }) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const pages = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(pages) || pages.some((entry) => entry._id === id)) continue;
    const fresh = pages.find((entry) => String(entry._id).startsWith("local-page-"));
    if (!fresh) continue;
    pages.push({ ...fresh, _id: id, title: "Remote page", parentPageId: null, content: undefined });
    localStorage.setItem(key, JSON.stringify(pages));
    return;
  }
}

async function openUnloadedPage(page, baseURL) {
  await openFreshPage(page, baseURL);
  await expect.poll(() => page.evaluate((prefix) => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && localStorage.getItem(key)?.includes('"_id":"local-page-')) return true;
    }
    return false;
  }, PAGE_CACHE_PREFIX)).toBe(true);
  await page.addInitScript(addMetadataOnlyPage, { prefix: PAGE_CACHE_PREFIX, id: REMOTE_ID });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Remote page", { exact: true }).first().click();
}

test.describe("a saved page whose body is not on this device", () => {
  test("shows why instead of an empty editor", async ({ page, baseURL }) => {
    await openUnloadedPage(page, baseURL);

    await expect(page.getByText("Sign in to load this page")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveText("Remote page");
    await expect(getEditors(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Click here to start writing/i })).toHaveCount(0);
  });

  test("is a quiet empty state centred in the page column", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openUnloadedPage(page, baseURL);

    const state = page.getByRole("status").filter({ hasText: "Sign in to load this page" });
    await expect(state).toBeVisible();
    await expect(state.locator("svg[aria-hidden='true']")).toHaveCount(1);

    const description = state.getByText("Its content is on the server");
    expect(await computed(description, "color")).toBe(await tokenValue(page, "color", "--osio-fg-muted"));
    expect(await computed(description, "font-size")).toBe(await tokenValue(page, "font-size", "--osio-font-size-sm"));

    const column = await page.locator(".osionos-page-header").first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2;
    });
    const { x, width } = await description.boundingBox();
    expect(Math.abs(x + width / 2 - column)).toBeLessThanOrEqual(2);
  });
});
