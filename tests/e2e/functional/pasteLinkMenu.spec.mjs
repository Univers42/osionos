// Paste menu for a bare URL (URL, Mention, Bookmark, Embed) and Turn into for link blocks.
// Offline: non-localhost requests get 204. Nothing may hit the embed bridge before a choice.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  contextMenuItem,
  contextSubMenuItem,
  openFreshPage,
  pasteTextAtCurrentCaret,
} from "../../browser/core/app.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const PLAIN = "https://example.com/a";
const bridgeCalls = [];

test.beforeEach(async ({ page }) => {
  bridgeCalls.length = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/embed/")) bridgeCalls.push(request.url());
  });
  await page.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) => route.fulfill({ status: 204 }),
  );
});

const menu = (page) => page.getByTestId("paste-link-menu");
const choice = (page, name) => menu(page).locator(`[data-choice="${name}"]`);
const linkBlock = (page) => page.getByTestId("link-block-editor");

async function pasteInto(page, baseURL, { before = "", url }) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  if (before) await page.keyboard.type(before);
  await pasteTextAtCurrentCaret(page, url);
  await expect(menu(page)).toBeVisible();
  return editor;
}

test.describe("paste link menu", () => {
  test("a YouTube URL defaults to Embed and Enter makes a facade embed", async ({ page, baseURL }) => {
    await pasteInto(page, baseURL, { url: YOUTUBE });
    await expect(choice(page, "embed")).toHaveAttribute("data-active", "true");
    expect(bridgeCalls, "no bridge call while the menu is open").toEqual([]);
    await page.keyboard.press("Enter");
    await expect(linkBlock(page)).toHaveCount(1);
    await expect(linkBlock(page).locator("xpath=ancestor-or-self::*[@data-block-type]").first()).toHaveAttribute("data-block-type", "embed");
    await expect(linkBlock(page).getByRole("button", { name: /^Play (.+ )?on youtube$/i })).toBeVisible();
  });

  test("a mid-sentence URL defaults to URL; Bookmark keeps the sentence and adds a bookmark after", async ({ page, baseURL }) => {
    const editor = await pasteInto(page, baseURL, { before: "see ", url: PLAIN });
    await expect(choice(page, "url")).toHaveAttribute("data-active", "true");
    expect(bridgeCalls).toEqual([]);
    await choice(page, "bookmark").click();
    await expect(linkBlock(page)).toHaveCount(1);
    await expect(linkBlock(page).locator("xpath=ancestor-or-self::*[@data-block-type]").first()).toHaveAttribute("data-block-type", "bookmark");
    await expect(editor).toContainText("see");
    await expect(editor.locator("a.editor-link")).toHaveCount(0);
  });

  test("Mention renders a chip with a favicon and the marker never shows as a tooltip", async ({ page, baseURL }) => {
    const editor = await pasteInto(page, baseURL, { before: "see ", url: PLAIN });
    await choice(page, "mention").click();
    const chip = editor.locator("a.editor-link.editor-link-mention");
    await expect(chip).toHaveCount(1);
    await expect(chip.locator("img[data-link-favicon]")).toHaveAttribute("src", "https://example.com/favicon.ico");
    expect(await chip.getAttribute("title")).not.toContain("osio:mention");
    await page.keyboard.type("x");
    await expect(editor.locator("a.editor-link.editor-link-mention")).toHaveCount(1);
  });

  test("Escape keeps a plain link and makes no bridge call", async ({ page, baseURL }) => {
    const editor = await pasteInto(page, baseURL, { url: PLAIN });
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(editor.locator("a.editor-link")).toHaveCount(1);
    await expect(editor.locator("a.editor-link-mention")).toHaveCount(0);
    expect(bridgeCalls).toEqual([]);
  });

  test("Turn into switches an embed to a bookmark and back", async ({ page, baseURL }) => {
    await pasteInto(page, baseURL, { url: YOUTUBE });
    await page.keyboard.press("Enter");
    await expect(linkBlock(page)).toHaveCount(1);
    for (const [target, type] of [["Bookmark", "bookmark"], ["Embed", "embed"]]) {
      await page.locator("[data-block-type]").filter({ has: linkBlock(page) }).first()
        .click({ button: "right", position: { x: 2, y: 2 } });
      await contextMenuItem(page, "Turn into").hover();
      await contextSubMenuItem(page, target).click();
      await expect(linkBlock(page)).toHaveCount(1);
      await expect(page.locator(`[data-block-type="${type}"]`).first()).toBeAttached();
    }
    await expect(linkBlock(page).getByRole("button", { name: /^Play (.+ )?on youtube$/i })).toBeVisible();
  });
});
