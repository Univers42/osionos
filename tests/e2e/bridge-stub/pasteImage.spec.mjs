/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pasteImage.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 20:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global ClipboardItem, Blob, Uint8Array, atob, localStorage, navigator, sessionStorage */

// A pasted screenshot is uploaded before it reaches the page: the block holds the
// media URL, never base64, which filled localStorage and raised "Browser storage is
// full" on every screenshot paste although the picture saved.

import { expect, test } from "@playwright/test";

import { ensureClipboardAccess, explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MEDIA_PATH = `/api/media/uploads/e2e/${"a".repeat(64)}.png`;

test("a pasted screenshot lands as the uploaded URL, not base64", async ({ page, baseURL }) => {
  const uploads = [];
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/media/uploads" && request.method() === "POST") {
      uploads.push(request.headers()["content-type"]);
      return { json: { ok: true, media: { url: MEDIA_PATH } } };
    }
    if (request.method() === "PATCH" && url.pathname.startsWith("/api/pages/")) return { json: { version: 1 } };
    return undefined;
  });
  await page.addInitScript((ws) => {
    if (sessionStorage.getItem("paste-seeded") !== null) return;
    sessionStorage.setItem("paste-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{
      _id: "paste-host", title: "Paste host", workspaceId: ws, ownerId: "mock-user-0", visibility: "private",
      collaborators: [], parentPageId: null, databaseId: null, archivedAt: null,
      content: [{ id: "p1", type: "paragraph", content: "shot: " }],
    }]));
    localStorage.setItem("pg:recents", "[]");
  }, WS);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Paste host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));

  const editor = page.locator('.osionos-page [data-block-id="p1"] [contenteditable]').first();
  await editor.click();
  await page.keyboard.press("End");
  await ensureClipboardAccess(page);
  await page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  }, TINY_PNG);
  await page.keyboard.press("ControlOrMeta+V");

  await expect(editor.locator("img")).toHaveAttribute("src", `https://bridge.invalid${MEDIA_PATH}`);
  expect(uploads).toEqual(["image/png"]);
  await expect(editor).toContainText("shot:");
  const cached = await page.evaluate((ws) => localStorage.getItem(`osio:pages:${ws}`) ?? "", WS);
  expect(cached).not.toContain("data:image/");
});
