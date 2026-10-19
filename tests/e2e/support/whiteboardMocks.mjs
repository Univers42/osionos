// Shared mocks for the whiteboard specs: the drawnosaurus service, the per-user installed-apps
// endpoint of the bridge, and an installed copy of the retired marketplace entry.
//
// The whiteboard is built in, so no spec needs these to USE it. They exist to show that the
// installed map does not matter: an empty one changes nothing, and an `osionos.whiteboard`
// entry in it must not add a second rail icon.
//
// Caveat: the default Playwright harness builds OFFLINE (VITE_API_URL=''), so the app never
// asks the bridge for installed apps and an entry cannot be injected from outside. A case that
// needs one skips (`skipWhenOffline`); run it against a build with VITE_API_URL set to any
// origin, since every request to it is mocked here.

import { test } from "@playwright/test";

export const WHITEBOARD_INSTALLED = {
  "osionos.whiteboard": {
    identifier: "osionos.whiteboard",
    title: "Whiteboard",
    icon: "icon:pen-tool",
    launchKind: "embed",
    launchUrl: "https://localhost:3007",
    autoUpdate: true,
    active: true,
    installedAt: "2026-06-01T00:00:00Z",
  },
};

/** Mocks the drawnosaurus service (https://localhost:3007): POST /v1/boards answers 201 with
 *  `slug` and `title` and hands the request body to `onCreate`; anything else is a stub board page. */
export async function mockWhiteboardService(page, { slug, title, onCreate }) {
  await page.route("https://localhost:3007/**", (route) => {
    const request = route.request();
    if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/boards") {
      onCreate(request.postDataJSON());
      return route.fulfill({ status: 201, json: { slug, title } });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>board</title><p>board</p>" });
  });
}

/** Mocks the drawnosaurus service failing: every request answers 500 "Board service is down."
 *  Returns a probe whose `count` is the number of requests it answered. */
export async function mockWhiteboardFailure(page) {
  const posts = { count: 0 };
  await page.route("https://localhost:3007/**", (route) => {
    posts.count += 1;
    return route.fulfill({ status: 500, json: { error: { code: "internal", message: "Board service is down." } } });
  });
  return posts;
}

/** Answers GET /api/marketplace/installed with `installed`; returns a probe for the offline guard. */
export async function mockInstalled(page, installed) {
  const probe = { requested: false };
  await page.route("**/api/marketplace/installed", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { ok: true } });
    probe.requested = true;
    return route.fulfill({ json: { installed } });
  });
  return probe;
}

/** Skips the test when the app never asked for installed apps (an offline build). */
export async function skipWhenOffline(page, probe) {
  await page.waitForTimeout(1_500);
  test.skip(!probe.requested, "offline build (VITE_API_URL unset): run against an online build to exercise this");
}
