/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   avatarUpload.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The avatar uploader produces the three square variants the bridge stores.
//
// Runs against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1): the offline build has no
// bridge, so the Profile panel draws no editor there (profileEditor.spec.mjs pins
// that). The variants are observed at the canvas — the three squares the uploader
// draws are exactly what the bridge receives (tests/bridge/bridge-avatar.test.mjs
// reads the other end of the contract, tests/canvas/avatar-variants.test.ts the producer).

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

// Tiny valid PNG (1×1 transparent).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const SIZES = [64, 160, 460];
const UPLOAD = { json: { avatar: "https://bridge.invalid/avatars/e2e.webp" } };
const CAPS = { 64: 24 * 1024, 160: 80 * 1024, 460: 300 * 1024 };

/** Records every canvas the page encodes, so the variants can be read. */
function instrumentCanvas() {
  const original = HTMLCanvasElement.prototype.toBlob;
  window.__avatarRenders = [];
  HTMLCanvasElement.prototype.toBlob = function patched(callback, type, quality) {
    const canvas = this;
    return original.call(canvas, (blob) => {
      window.__avatarRenders.push({
        width: canvas.width,
        height: canvas.height,
        type: blob?.type ?? null,
        quality,
        size: blob?.size ?? 0,
      });
      callback(blob);
    }, type, quality);
  };
}

const PROFILE = {
  userId: "e2e-user", displayName: "E2E User", username: "e2e", pronouns: null, headline: null, bio: null,
  location: null, company: null, website: null, links: [], timezone: null, orcid: null, patreon: null,
  avatarUrl: null, bannerUrl: null, directoryOptOut: false, profession: null, readmePageId: null,
  version: 1, createdAt: null, updatedAt: null,
};

/** Serves the profile read that makes the editor render, and answers the avatar POST with `upload`. */
async function stubProfile(page, upload) {
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/account/profile" && request.method() === "GET") return { json: PROFILE };
    if (url.pathname === "/api/profile/avatar" && request.method() === "POST") return upload;
    return undefined;
  });
}

async function openProfilePanel(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  await openSettings(page);
  // The nav row is named after the signed-in persona, not "Profile".
  await region(page).locator('[data-settings-section="profile"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "Profile", exact: true })).toBeVisible();
  return region(page);
}

const renders = (page) =>
  page.evaluate(() => (window.__avatarRenders ?? []).filter((render) => [64, 160, 460].includes(render.width)));

test.describe("the avatar uploader", () => {
  test("draws three square variants of the sizes the bridge stores", async ({ page, baseURL }) => {
    await page.addInitScript(instrumentCanvas);
    await stubProfile(page, UPLOAD);
    const region = await openProfilePanel(page, baseURL);

    await region.locator('input[type="file"]:not([aria-label="Banner image"])').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect.poll(async () => (await renders(page)).length, { timeout: 20_000 }).toBe(3);
    const drawn = await renders(page);

    expect(drawn.map((render) => render.width).sort((a, b) => a - b)).toEqual(SIZES);
    for (const render of drawn) {
      expect(render.height, "the variant is square").toBe(render.width);
      expect(["image/webp", "image/jpeg"], "the bridge takes WebP or JPEG").toContain(render.type);
      expect(render.size, `the ${render.width}px variant is under its cap`).toBeLessThanOrEqual(CAPS[render.width]);
    }
  });

  test("tells the user when the upload could not be saved", async ({ page, baseURL }) => {
    await page.addInitScript(instrumentCanvas);
    await stubProfile(page, { status: 500, json: { ok: false, message: "boom" } });
    const region = await openProfilePanel(page, baseURL);

    await region.locator('input[type="file"]:not([aria-label="Banner image"])').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // The bridge refuses the upload, and the panel says so.
    await expect(region.getByText("Upload failed")).toBeVisible({ timeout: 20_000 });
  });
});
