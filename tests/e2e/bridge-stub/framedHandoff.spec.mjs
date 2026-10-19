// A page the viewer embedded can answer with a 302 to `<this app>/#bridge_token=<attacker's>`.
// The app then boots inside the frame, same-origin, and must not consume the handoff: that would
// replace the viewer's account set (devil C26). This runs only with PLAYWRIGHT_BRIDGE_STUB=1,
// because with the default `VITE_API_URL=""` the consume step never fetches and a 0 proves nothing;
// the top-level control below fails the test if that ever stops being the case.

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const REDIRECTOR = "https://embed-redirect.test/r";
const CONSUME_PATH = "/api/auth/bridge/consume";

async function watchConsume(page) {
  const consumes = [];
  await stubBridge(page, (url) => {
    if (url.pathname !== CONSUME_PATH) return undefined;
    consumes.push(url.href);
    return { status: 401, json: { error: "stub" } };
  });
  return consumes;
}

test("a frame redirected to the app's own origin reaches it but consumes nothing", async ({ page, baseURL }) => {
  const consumes = await watchConsume(page);
  await page.route(REDIRECTOR, (route) =>
    route.fulfill({ status: 302, headers: { location: `${baseURL}/#bridge_token=probe` } }),
  );
  await seedPage(page, baseURL, [{ id: "e1", type: "embed", content: REDIRECTOR }]);
  const frame = page.locator('[data-block-type="embed"] iframe');
  await expect(frame).toHaveAttribute("src", REDIRECTOR);
  await expect.poll(() => page.frames().some((entry) => entry !== page.mainFrame() && entry.url().startsWith(baseURL))).toBe(true);
  const appFrame = page.frames().find((entry) => entry !== page.mainFrame() && entry.url().startsWith(baseURL));
  await appFrame.waitForLoadState("networkidle");
  await expect(appFrame.locator("body")).toBeAttached();
  console.log(`framed boot consume requests: ${consumes.length}`);
  expect(consumes).toHaveLength(0);
});

test("control: the same URL at top level consumes exactly once", async ({ page }) => {
  const consumes = await watchConsume(page);
  await page.goto("/#bridge_token=probe", { waitUntil: "domcontentloaded" });
  await expect.poll(() => consumes.length).toBe(1);
  console.log(`top-level boot consume requests: ${consumes.length}`);
});
