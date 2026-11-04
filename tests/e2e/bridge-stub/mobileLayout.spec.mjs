// #295 (subject III.3, responsive): at a phone's 390x844 and a tablet's 768x1024, no main surface
// is cut off by the window's right edge and the document never scrolls sideways. Production at
// 390 px had the messaging panel past the edge ("Mes") and the rail beside a clipped Calendar.

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { clippedPastRight, pageScrollsSideways } from "../support/viewportOverflow.mjs";

const DM = {
  id: "dm-bob", workspaceId: "ws-1", kind: "dm", name: "Bob Jones", topic: null,
  createdBy: "user-456", isPrivate: true, memberRole: "member", createdAt: "2026-10-30T09:00:00.000Z",
};
const MESSAGE = {
  id: "m-bob-1", channelId: DM.id, authorId: "user-456", authorName: "Bob Jones",
  content: "Are we still on for the review at three?", createdAt: "2026-10-30T09:05:00.000Z", reactions: [],
};

async function stubChat(page) {
  await stubBridge(page, (url, request) => {
    if (request.method() !== "GET") return undefined;
    if (url.pathname === "/api/chat/channels") return { json: { channels: [DM] } };
    if (url.pathname === `/api/chat/channels/${DM.id}/messages`) {
      return { json: { channelId: DM.id, workspaceId: DM.workspaceId, messages: [MESSAGE] } };
    }
    return undefined;
  });
  await page.route("https://calendar.invalid/**", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Calendar</title><header style='display:flex;justify-content:space-between'><b>November 2026</b><button>Today</button></header>",
  }));
}

/** The rail's panels and tabs other than Conversations and Calendar, which have their own tests. */
const RAIL_SURFACES = ["Explorer", "Search", "Databases", "My Tasks", "Shared", "Library", "Source Control", "Run",
  "Problems", "Issues", "AI Hub", "Notifications", "Marketplace", "Settings"];

/** openSignedIn, minus its wait on the first "Settings" button, which a phone lays out hidden. */
async function openSignedIn(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('[role="tab"][aria-label="Home"]').first().waitFor();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

/** The rail item, wherever the layout puts it at this width (rail, drawer or bottom bar). */
const railItem = (page, name) => page.getByRole("button", { name, exact: true }).or(page.getByRole("tab", { name, exact: true })).first();

/** A screenshot kept on disk for the PR, pass or fail (the done-when of #295 asks for them). */
async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectFits(page, surface) {
  await page.waitForTimeout(300);
  expect(await pageScrollsSideways(page), `${surface}: the document scrolls sideways`).toBe(false);
  expect(await clippedPastRight(page), `${surface}: cut off by the right edge`).toEqual([]);
}

async function expectInside(page, locator, surface) {
  const box = await locator.boundingBox();
  const width = page.viewportSize().width;
  expect(box, `${surface}: the control is laid out`).not.toBeNull();
  expect(box.x, `${surface}: starts inside the window`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${surface}: ends inside the window`).toBeLessThanOrEqual(width + 0.5);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test.describe(`mobile layout at ${viewport.width}x${viewport.height} (#295)`, () => {
    test.use({ viewport, hasTouch: true, isMobile: viewport.width < 768 });

    test("Home and a new page fit the window", async ({ page, baseURL }, testInfo) => {
      await stubChat(page);
      await openSignedIn(page, baseURL);
      await expectFits(page, "Home");
      await attachScreenshot(page, testInfo, `home-${viewport.width}`);
      await page.getByRole("button", { name: "New page", exact: true }).first().click();
      const title = page.getByRole("textbox", { name: "Page title" });
      await expect(title).toBeVisible();
      await expectFits(page, "New page");
      await expectInside(page, title, "Page title");
      await attachScreenshot(page, testInfo, `page-${viewport.width}`);
    });

    test("every other rail surface fits the window", async ({ page, baseURL }, testInfo) => {
      await stubChat(page);
      await openSignedIn(page, baseURL);
      for (const name of RAIL_SURFACES) {
        await railItem(page, name).click();
        await expectFits(page, name);
        await attachScreenshot(page, testInfo, `${name.toLowerCase().replaceAll(" ", "-")}-${viewport.width}`);
      }
    });

    test("the messaging panel and a conversation fit the window", async ({ page, baseURL }, testInfo) => {
      await stubChat(page);
      await openSignedIn(page, baseURL);
      await railItem(page, "Conversations").click();
      const panel = page.locator('[data-sidebar-panel="conversations"]');
      await expect(panel).toBeVisible();
      await expectFits(page, "Conversations panel");
      await expectInside(page, panel, "Conversations panel");
      await panel.getByText(DM.name).first().click();
      await expect(page.getByText(MESSAGE.content)).toBeVisible();
      await expectFits(page, "Conversation");
      await expectInside(page, page.getByPlaceholder(`Message #${DM.name}`), "Composer");
      await attachScreenshot(page, testInfo, `messaging-${viewport.width}`);
    });

    test("the Calendar takes the window's width", async ({ page, baseURL }, testInfo) => {
      await stubChat(page);
      await openSignedIn(page, baseURL);
      await railItem(page, "Calendar").click();
      const frame = page.locator('iframe[src^="https://calendar.invalid"]');
      await expect(frame).toBeVisible();
      await expectFits(page, "Calendar");
      await expectInside(page, frame, "Calendar frame");
      await expectInside(page, page.frameLocator('iframe[src^="https://calendar.invalid"]').getByRole("button", { name: "Today" }), "Calendar header");
      await attachScreenshot(page, testInfo, `calendar-${viewport.width}`);
    });
  });
}

test("the probe reports an element past the right edge, so a pass is not vacuous", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubChat(page);
  await openSignedIn(page, baseURL);
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.className = "probe-wide";
    wide.style.cssText = "position:fixed;top:0;left:0;width:469px;height:8px";
    document.body.append(wide);
  });
  expect(await clippedPastRight(page)).toContain("DIV.probe-wide right=469");
});
