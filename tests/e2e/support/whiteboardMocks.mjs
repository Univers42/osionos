// Shared mocks for the whiteboard specs: hydrawn's web app, the per-user installed-apps
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
    launchUrl: "https://localhost:3008",
    autoUpdate: true,
    active: true,
    installedAt: "2026-06-01T00:00:00Z",
  },
};

export const HYDRAWN_ORIGIN = "https://localhost:3008";

/** Mocks hydrawn (HYDRAWN_ORIGIN). `/new?title=` hands the title to `onCreate` and answers a page
 *  that reports board `slug` to its parent, as hydrawn's own `/new` does once the board exists;
 *  anything else is a stub page. Caveat: no token is ever requested, so this proves the frame
 *  protocol and the URLs, not storage; the bridge suite covers the routes. */
export async function mockHydrawn(page, { slug, onCreate = () => {} }) {
  await page.route(`${HYDRAWN_ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/new") {
      onCreate(url.searchParams.get("title"));
      const report = JSON.stringify({ type: "hydrawn:board-created", slug });
      return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>new</title><script>parent.postMessage(${report}, "*")</script>` });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>hydrawn</title><p>hydrawn</p>" });
  });
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
