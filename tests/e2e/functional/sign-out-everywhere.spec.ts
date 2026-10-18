// Sign out of all devices: A signs out, B's next bridge call is refused with session_revoked, B
// lands on sign-in, and B's unsynced edit is still there (and is published) once B signs in again.
//
// The bridge is stubbed with route handlers, never a real one. The app only talks to a bridge when
// the build has a VITE_API_URL, and the default harness builds offline, so this spec skips there.
// Run it with the dev server's own origin as the bridge, so no CORS preflight is involved:
//   PLAYWRIGHT_API_URL=http://127.0.0.1:3004 pnpm exec playwright test tests/e2e/functional/sign-out-everywhere.spec.ts

import { test, expect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";

import { clearAndTypePageTitle, pageTitleEditor } from "../../browser/core/app.mjs";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "";
const USER_ID = "user-sign-out-everywhere";
const WORKSPACE = { _id: "ws-1", name: "Home", slug: "home", ownerId: USER_ID, memberIds: [USER_ID], settings: {} };
const SERVER_PAGE = {
  // A UUID: the outbox only publishes ids it recognises as server-persisted.
  _id: "3f1c2a40-5b7e-4c1d-9a6e-0d2b7f4a8c11",
  title: "Server title",
  workspaceId: WORKSPACE._id,
  ownerId: USER_ID,
  visibility: "private",
  updatedAt: "2026-01-01T00:00:00.000Z",
  content: [],
  properties: [],
};
const EDITED_TITLE = "Edited on device B";

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const appToken = (label: string) =>
  `osionos_v1.${base64url({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600, label })}.sig-${label}`;

function sessionRecord(token: string) {
  return {
    ok: true,
    persona: { id: USER_ID, email: "sign-out@example.test", password: "", name: "Sign Out", emoji: "S", roleBadge: "", persistInSessions: true },
    session: { userId: USER_ID, accessToken: token, refreshToken: "", privateWorkspaces: [WORKSPACE], sharedWorkspaces: [] },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** One bridge shared by both contexts: logout from any device revokes every token of the user. */
function createBridgeStub() {
  const revoked = new Set<string>();
  const issued = new Set<string>();
  const patches: Array<{ token: string; title: unknown }> = [];
  const logouts: string[] = [];
  const refused: string[] = [];
  const reply = (route: Route, status: number, body?: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });

  async function handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const token = (request.headers()["authorization"] ?? "").replace(/^Bearer\s+/i, "");
    if (token && revoked.has(token)) {
      refused.push(`${request.method()} ${url.pathname}`);
      return reply(route, 401, { ok: false, code: "session_revoked", message: "App session was signed out." });
    }
    if (url.pathname === "/api/auth/bridge/logout") {
      logouts.push(token);
      for (const issuedToken of issued) revoked.add(issuedToken);
      return reply(route, 204);
    }
    if (url.pathname === "/api/auth/bridge/consume") {
      const fresh = appToken(`resign-${issued.size}`);
      issued.add(fresh);
      return reply(route, 200, sessionRecord(fresh));
    }
    if (url.pathname === "/api/workspaces") return reply(route, 200, [WORKSPACE]);
    if (url.pathname === "/api/pages/all") return reply(route, 200, [SERVER_PAGE]);
    if (request.method() === "PATCH" && url.pathname === `/api/pages/${SERVER_PAGE._id}`) {
      patches.push({ token, title: request.postDataJSON()?.title });
      return reply(route, 200, { ok: true });
    }
    return reply(route, 200, []);
  }
  return { handle, issue: (token: string) => issued.add(token), patches, logouts, refused };
}

async function openDevice(browser: Browser, baseURL: string, bridge: ReturnType<typeof createBridgeStub>, token: string) {
  const context: BrowserContext = await browser.newContext({ baseURL });
  bridge.issue(token);
  await context.addInitScript(
    ([key, record]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ [record.session.userId]: record }));
    },
    ["osionos:bridge-session", sessionRecord(token)] as const,
  );
  await context.route(`${API_URL}/api/**`, bridge.handle);
  const page = await context.newPage();
  await page.goto("/");
  return { context, page };
}

const signInHeading = (page: Page) => page.getByRole("heading", { name: "Open osionos from Prismatica" });

test.describe("sign out of all devices", () => {
  test.skip(!API_URL, "offline build (VITE_API_URL unset) — set PLAYWRIGHT_API_URL to the dev server origin to run this");

  test("A signs out; B is refused, shown sign-in, keeps its unsynced edit and publishes it after signing in again", async ({ browser, baseURL }) => {
    const bridge = createBridgeStub();
    const tokenA = appToken("device-a");
    const tokenB = appToken("device-b");
    const deviceA = await openDevice(browser, baseURL!, bridge, tokenA);
    const deviceB = await openDevice(browser, baseURL!, bridge, tokenB);

    await deviceB.page.getByText("Server title").first().click();
    await expect(pageTitleEditor(deviceB.page)).toBeVisible();

    await deviceA.page.getByRole("button", { name: WORKSPACE.name, exact: true }).first().click();
    await deviceA.page.getByRole("button", { name: "Sign out of all devices" }).click();
    await expect(signInHeading(deviceA.page)).toBeVisible();
    expect(bridge.logouts).toEqual([tokenA]);

    // B's next bridge call is the outbox publishing this edit.
    await clearAndTypePageTitle(deviceB.page, EDITED_TITLE);
    await expect(signInHeading(deviceB.page)).toBeVisible();
    expect(bridge.refused.length).toBeGreaterThan(0);

    // Signing in again hands B a fresh token; the pending edit must survive and be published with it.
    // A hash-only goto is a same-document navigation, so reload to boot the app on the handoff.
    await deviceB.page.goto("/#bridge_token=handoff-b");
    await deviceB.page.reload();
    await deviceB.page.getByText(EDITED_TITLE).first().click();
    await expect(pageTitleEditor(deviceB.page)).toHaveText(EDITED_TITLE);
    await expect.poll(() => bridge.patches.filter((patch) => patch.token !== tokenB && patch.title === EDITED_TITLE).length).toBeGreaterThan(0);

    await deviceA.context.close();
    await deviceB.context.close();
  });
});
