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

/** Serves the profile read that makes the editor render, and answers the POST to `path` with `upload`. */
async function stubProfile(page, upload, path = "/api/profile/avatar") {
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/account/profile" && request.method() === "GET") return { json: PROFILE };
    if (url.pathname === path && request.method() === "POST") return upload;
    return undefined;
  });
}

/** Opens the panel, then ends the session the way an expiry does; returns the region and the uploads sent. */
async function openWithEndedSession(page, baseURL) {
  const posted = [];
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/profile/")) posted.push(request.url()); });
  await stubProfile(page, UPLOAD);
  const region = await openProfilePanel(page, baseURL);
  // Ended only once the editor is drawn: before the profile read lands, the panel would show its offline notice.
  await expect(region.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => null, activeJwt: () => null }));
  return { region, posted };
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

    await pickPhoto(region);

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

    await pickPhoto(region);

    // The bridge refuses the upload, and the panel says so — without the server's internals.
    const failure = uploadAlert(region);
    await expect(failure).toContainText("Try again", { timeout: 20_000 });
    await expect(failure).not.toContainText("boom");
  });

  // #171: the panel said only "Upload failed", whatever the bridge refused.
  test("says why the bridge refused the photo", async ({ page, baseURL }) => {
    await page.addInitScript(instrumentCanvas);
    const reason = "The 460px variant is over its 300KB cap.";
    await stubProfile(page, { status: 422, json: { ok: false, code: "avatar_variant_too_large", message: reason } });
    const region = await openProfilePanel(page, baseURL);

    await pickPhoto(region);

    await expect(uploadAlert(region)).toHaveText(`Upload failed: ${reason}`, { timeout: 20_000 });
  });

  // #171: with no session the pick did nothing at all — no request, no word.
  test("says to sign in again when the session has ended", async ({ page, baseURL }) => {
    const { region, posted } = await openWithEndedSession(page, baseURL);

    await pickPhoto(region);

    await expect(uploadAlert(region)).toContainText("Sign in again", { timeout: 20_000 });
    expect(posted, "no upload is sent without a session").toEqual([]);
  });
});

test.describe("the banner uploader", () => {
  // #171: a refused banner said "Try a smaller image" whatever the bridge refused.
  test("says why the bridge refused the banner", async ({ page, baseURL }) => {
    const reason = "The banner is 1500x400, not 1500x500.";
    await stubProfile(page, { status: 422, json: { ok: false, code: "banner_wrong_size", message: reason } }, "/api/profile/banner");
    const region = await openProfilePanel(page, baseURL);

    await pickBanner(region);

    await expect(page.getByText(reason)).toBeVisible({ timeout: 20_000 });
  });

  test("says to sign in again when the session has ended", async ({ page, baseURL }) => {
    const { region, posted } = await openWithEndedSession(page, baseURL);

    await pickBanner(region);

    await expect(page.getByText("Sign in again")).toBeVisible({ timeout: 20_000 });
    expect(posted, "no upload is sent without a session").toEqual([]);
  });
});

// Other sections of the panel raise their own alerts on the stub's 503s.
const uploadAlert = (region) => region.getByRole("alert").filter({ hasText: "Upload failed" });

function pickPhoto(region) {
  return region.locator('input[type="file"]:not([aria-label="Banner image"])').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
}

function pickBanner(region) {
  return region.getByLabel("Banner image").setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: TINY_PNG });
}

// Fields about the person carry their WCAG input purpose, so a browser or an assistive
// tool can fill or iconify them (RGAA 11.13, #224).
test("the profile fields about the person name their input purpose", async ({ page, baseURL }) => {
  await stubProfile(page, UPLOAD);
  const panel = await openProfilePanel(page, baseURL);
  await expect(panel.getByLabel("Display name")).toHaveAttribute("autocomplete", "nickname");
  await expect(panel.getByLabel("Company")).toHaveAttribute("autocomplete", "organization");
  await expect(panel.getByLabel("Website")).toHaveAttribute("autocomplete", "url");
});
