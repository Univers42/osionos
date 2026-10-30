// Answers every request to the stub bridge host (PLAYWRIGHT_BRIDGE_STUB=1 builds point
// VITE_API_URL at it) from the test, with the CORS headers a credentialed cross-origin fetch needs.
// `respond(url, request)` returns `{ status?, json? }` for a request it handles; anything else is a
// 503, which the app treats as an unreachable bridge.

export const BRIDGE_STUB_ORIGIN = "https://bridge.invalid";

export async function stubBridge(page, respond) {
  await page.route(`${BRIDGE_STUB_ORIGIN}/**`, (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": request.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const answer = respond(new URL(request.url()), request) ?? { status: 503, json: {} };
    return route.fulfill({ status: answer.status ?? 200, headers, json: answer.json ?? {} });
  });
}

// Seeded once the boot sign-in has written its session, or that write overwrites the token.
export async function openSignedIn(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).first().waitFor();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}
