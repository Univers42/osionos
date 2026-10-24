/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridgeSession.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared setup of the offline-build specs that talk to a mocked bridge: the build blanks
// VITE_API_URL, so the client is given the page's own origin, and the session is a seeded
// bridge record whose app-session token carries the role claim. Affordance only: the server's
// refusal is covered by the bridge suites.

const USER_ID = "user-bridge-spec";
const WORKSPACE = { _id: "ws-bridge", name: "Home", slug: "home", ownerId: USER_ID, memberIds: [USER_ID], settings: {} };

/** Point the app's API client at `origin` by rewriting the one define it is built with. */
export async function giveTheAppABridgeOrigin(page, origin) {
  await page.route("**/src/shared/api/client.ts", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source.replace(/("VITE_API_URL":\s*)""/, `$1"${origin}"`) });
  });
}

/** Seed a signed-in session whose token carries `claims` (e.g. platform_role). */
export async function seedSession(page, claims) {
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString("base64url");
  const record = {
    ok: true,
    persona: { id: USER_ID, email: "bridge-spec@example.test", password: "", name: "Bridge Spec", emoji: "B", roleBadge: "", persistInSessions: true },
    session: { userId: USER_ID, accessToken: `osionos_v1.${payload}.sig`, refreshToken: "", privateWorkspaces: [WORKSPACE], sharedWorkspaces: [] },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, JSON.stringify({ [value.session.userId]: value })),
    ["osionos:bridge-session", record],
  );
}

// Answer every other /api/ call with an empty body; a glob would also swallow the Vite modules under src/**/api/.
export async function stubRestOfTheBridge(page) {
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}
