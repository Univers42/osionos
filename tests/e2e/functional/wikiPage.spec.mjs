/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wikiPage.spec.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 04:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 04:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A wiki works like Notion's: the page is the wiki's home and stays a normal,
// editable page (icon, cover, blocks), and its pages are listed below it.
// "Convert to wiki" (sidebar ··· menu) sets surface "wiki" through patchPage;
// these tests make the same call so they do not depend on where the new page
// lands in a long sidebar.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

/** Turns the open page into a wiki, optionally with an icon; returns its id. */
async function convertToWiki(page, icon) {
  return page.evaluate(async (nextIcon) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    const id = store.activePage?.id;
    store.patchPage(id, nextIcon ? { surface: "wiki", icon: nextIcon } : { surface: "wiki" });
    return id;
  }, icon ?? null);
}

async function openById(page, id) {
  await page.evaluate(async (pageId) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    const entry = store.pageById(pageId);
    store.openPage({ id: pageId, workspaceId: entry.workspaceId, kind: "page", title: entry.title });
  }, id);
  await waitForRenderStability(page);
}

const wikiPages = (page) => page.getByTestId("wiki-pages");

test.describe("wiki pages", () => {
  test("a wiki shows its emoji, even one the icon library does not list", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await activateFirstEditor(page);
    const title = `Handbook ${Date.now().toString(36)}`;
    await convertToWiki(page, "📕");
    await page.evaluate(async (nextTitle) => {
      const { usePageStore } = await import("/src/store/usePageStore.ts");
      const store = usePageStore.getState();
      store.patchPage(store.activePage?.id, { title: nextTitle });
    }, title);
    await waitForRenderStability(page);

    await expect(page.getByTestId("page-icon-toggle-picker")).toHaveText("📕");
    // The explorer row shows the wiki's own icon, not the default book.
    await expect(page.getByRole("treeitem", { name: `📕 ${title}` })).toHaveCount(1);
  });

  test("a wiki lists its pages, and New page adds one under it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await activateFirstEditor(page);
    const wikiId = await convertToWiki(page, "📚");
    await waitForRenderStability(page);

    await expect(wikiPages(page)).toContainText("No pages in this wiki yet.");
    await wikiPages(page).getByRole("button", { name: "New page" }).click();
    await waitForRenderStability(page);
    const childId = await page.evaluate(async () => (await import("/src/store/usePageStore.ts")).usePageStore.getState().activePage?.id);
    expect(childId).not.toBe(wikiId);

    await openById(page, wikiId);
    await expect(wikiPages(page).getByRole("listitem")).toHaveCount(1);
    await expect(wikiPages(page)).toContainText("Untitled");
    await wikiPages(page).getByRole("button", { name: /Untitled/ }).click();
    await waitForRenderStability(page);
    expect(await page.evaluate(async () => (await import("/src/store/usePageStore.ts")).usePageStore.getState().activePage?.id)).toBe(childId);
  });

  test("a wiki's home is still a page: blocks, a cover and an icon can be added", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await convertToWiki(page);
    await waitForRenderStability(page);

    await editor.click();
    await page.keyboard.type("Wiki home text");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A second block");
    await expect(page.locator(".osionos-page-body").getByText("A second block")).toBeVisible();

    await page.locator(".osionos-page-header").hover();
    await page.getByRole("button", { name: /Add icon/i }).click();
    await expect(page.getByTestId("page-icon-toggle-picker")).not.toBeEmpty();

    await page.locator(".osionos-page-header").hover();
    await page.getByRole("button", { name: /Add cover/i }).click();
    await page.getByTestId("cover-picker-item").first().click();
    await expect(page.locator(".osionos-page-cover")).toHaveCount(1);
  });

  test("the page ··· menu turns a page into a wiki and back", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await activateFirstEditor(page);

    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Turn into wiki" }).click();
    await expect(wikiPages(page)).toBeVisible();

    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Turn into page" }).click();
    await expect(wikiPages(page)).toHaveCount(0);
  });
});
