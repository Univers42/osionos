// groot ADR 0064 PS32/PS34/PS36/PS37 in a browser (PLAYWRIGHT_BRIDGE_STUB=1): with
// osio.profile.page on, a profile is its owner's README page with the banner as its cover;
// with it off, the profile is today's. The owner without a README is offered the page and is
// never given one by opening the profile. The rules themselves are proven in tests/canvas/
// profile-page-*.test.ts and profile-as-page.test.ts.

import { expect, test } from "@playwright/test";

import { BOB_PUBLIC, OTHER, heading, openProfileFromPalette, profileBody } from "../support/profilePageMocks.mjs";
import { BRIDGE_STUB_ORIGIN, openSignedIn, stubBridge } from "../support/bridgeStub.mjs";

const README_ID = "22222222-2222-4222-8222-222222222222";
const BANNER = `/api/media/avatars/${OTHER.id}/${"a".repeat(64)}-banner.webp`;
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==", "base64");
const BOB_CARD = {
  ...BOB_PUBLIC, headline: "Draws things", bannerUrl: BANNER,
  readme: { pageId: README_ID, blocks: [{ id: "r1", type: "paragraph", content: "Hello from Bob's README" }] },
};

const person = (id, name, username) => ({ id, name, username, avatar: null, headline: null, online: false });

async function flagged(page, on) {
  await page.addInitScript((value) => {
    if (value) localStorage.setItem("osio.profile.page", "1");
    else localStorage.removeItem("osio.profile.page");
  }, on);
}

// Registered after stubBridge, so it answers the media reads (the stub only speaks JSON).
async function stubBannerImage(page) {
  await page.route(`${BRIDGE_STUB_ORIGIN}/api/media/**`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
}

async function openBob(page, baseURL, on) {
  await flagged(page, on);
  await stubBridge(page, (url) => {
    if (url.pathname === `/api/profile/${OTHER.id}`) return { json: profileBody(OTHER.id, OTHER.username, "Bob Jones") };
    if (url.pathname === `/api/users/${OTHER.username}`) return { json: BOB_CARD };
    if (url.pathname === "/api/directory/search") return { json: { people: [person(OTHER.id, "Bob Jones", OTHER.username)] } };
    return undefined;
  });
  await stubBannerImage(page);
  await openSignedIn(page, baseURL);
  await openProfileFromPalette(page, "Bob");
  await expect(heading(page, "Bob Jones")).toBeVisible();
}

// The signed-in owner's own profile. `readmePageId` set links a README that is archived.
async function openOwnProfile(page, baseURL, { readmePageId }) {
  await flagged(page, true);
  const created = [];
  let mine = "";
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/pages" && request.method() === "POST") created.push(url.pathname);
    if (url.pathname === `/api/pages/${README_ID}`) return { json: { _id: README_ID, workspaceId: "w-archived", title: "README", archivedAt: "2026-11-01T00:00:00.000Z" } };
    if (url.pathname === `/api/profile/${mine}`) return { json: profileBody(mine, "me-user", "Me Myself") };
    if (url.pathname === "/api/users/me-user") return { json: { ...BOB_PUBLIC, userId: mine, username: "me-user", displayName: "Me Myself" } };
    if (url.pathname === "/api/account/profile") return { json: { userId: mine, version: 1, readmePageId } };
    if (url.pathname === "/api/directory/search") return { json: { people: [person(mine, "Me Myself", "me-user")] } };
    return undefined;
  });
  await openSignedIn(page, baseURL);
  mine = await page.evaluate(() => {
    const state = globalThis.__playgroundUserStore.getState();
    return state.activeUserId || Object.keys(state.sessions)[0];
  });
  await openProfileFromPalette(page, "Me Myself");
  return { created };
}

test.describe("profile = a page (osio.profile.page)", () => {
  test("flag on: a visitor sees the README page with the banner as its cover", async ({ page, baseURL }) => {
    await openBob(page, baseURL, true);
    const asPage = page.getByTestId("profile-as-page");
    await expect(asPage).toBeVisible();
    await expect(asPage.getByTestId("page-cover-media").locator("img")).toHaveAttribute("src", `${BRIDGE_STUB_ORIGIN}${BANNER}`);
    await expect(asPage.getByRole("region", { name: "README" })).toContainText("Hello from Bob's README");
    await expect(asPage.getByRole("heading", { level: 1, name: "Bob Jones" })).toBeVisible();
    await expect(asPage.getByTestId("profile-identity")).toContainText("Draws things");
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
    await expect(asPage.getByRole("button", { name: "Edit page" })).toHaveCount(0);
  });

  test("flag off: the same profile is today's, banner and README", async ({ page, baseURL }) => {
    await openBob(page, baseURL, false);
    await expect(page.getByTestId("profile-banner")).toHaveAttribute("src", `${BRIDGE_STUB_ORIGIN}${BANNER}`);
    await expect(page.getByRole("region", { name: "README" })).toContainText("Hello from Bob's README");
    await expect(page.getByTestId("profile-as-page")).toHaveCount(0);
    // Another open tab may keep a page with a cover mounted; none of them draws the banner.
    await expect(page.locator('[data-testid="page-cover-media"] img[src$="-banner.webp"]')).toHaveCount(0);
  });

  test("flag on: the owner without a README is offered one, and viewing creates nothing", async ({ page, baseURL }) => {
    const { created } = await openOwnProfile(page, baseURL, { readmePageId: null });
    const offer = page.getByRole("region", { name: "Profile page" });
    await expect(offer.getByRole("button", { name: "Create profile page" })).toBeVisible();
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
    // Caveat: "nothing created" is checked once the offer is drawn, after the view's effects ran;
    // a write delayed past that point would not be seen here.
    expect(created).toEqual([]);
  });

  test("flag on: an archived README is said, then a second click replaces it", async ({ page, baseURL }) => {
    const { created } = await openOwnProfile(page, baseURL, { readmePageId: README_ID });
    const offer = page.getByRole("region", { name: "Profile page" });
    await offer.getByRole("button", { name: "Create profile page" }).click();
    await expect(offer.getByRole("alert")).toContainText("deleted or archived");
    expect(created).toEqual([]);
    await offer.getByRole("button", { name: "Create a new profile page" }).click();
    await expect.poll(() => created.length).toBe(1);
  });
});
