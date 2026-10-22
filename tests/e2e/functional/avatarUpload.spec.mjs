// The avatar uploader produces the three square variants the bridge stores.
//
// The offline build has no bridge: the api client refuses an empty API base, so
// the POST never leaves the browser. The variants are therefore observed at the
// canvas — the three squares the uploader draws are exactly what the bridge
// receives (tests/bridge/bridge-avatar.test.mjs reads the other end of the
// contract, and tests/canvas/avatar-variants.test.ts covers the producer).

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

// Tiny valid PNG (1×1 transparent).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const SIZES = [64, 160, 460];
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

/** The offline session carries no token, and the uploader needs one to work. */
async function seedSession(page) {
  await page.evaluate(() => {
    const store = globalThis.__playgroundUserStore;
    if (!store) return;
    const state = store.getState();
    const sessions = { ...state.sessions };
    const first = Object.keys(sessions)[0];
    if (!first) return;
    sessions[first] = { ...sessions[first], accessToken: "e2e.avatar.token" };
    store.setState({ sessions });
  });
}

async function openProfilePanel(page, baseURL) {
  await openFreshPage(page, baseURL);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const region = page.getByRole("region", { name: "Settings", exact: true });
  await region.waitFor();
  await region.locator('[data-settings-section="profile"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "Profile", exact: true })).toBeVisible();
  return region;
}

const renders = (page) =>
  page.evaluate(() => (window.__avatarRenders ?? []).filter((render) => [64, 160, 460].includes(render.width)));

test.describe("the avatar uploader", () => {
  test("draws three square variants of the sizes the bridge stores", async ({ page, baseURL }) => {
    await page.addInitScript(instrumentCanvas);
    const region = await openProfilePanel(page, baseURL);
    await seedSession(page);

    await region.locator('input[type="file"]').setInputFiles({
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
    const region = await openProfilePanel(page, baseURL);
    await seedSession(page);

    await region.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // The offline build has no bridge to answer the upload, and the panel says so.
    await expect(region.getByText("Upload failed")).toBeVisible({ timeout: 20_000 });
  });
});
