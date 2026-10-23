/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionsStub.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared setup for the Sessions panel specs: a fake GET /api/account/sessions and
// DELETE /api/account/sessions/<id> that keep their rows in memory, so a revoked row stays gone.
// `handleSessionRevoked` is replaced by a recorder, because the revoke of the current row must
// reach the user store's local sign-out and the page has no real bridge session to sign out.

import { stubBridge } from "./bridgeStub.mjs";
import { openSettings } from "./settingsHelpers.mjs";

export const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const ELECTRON = `${CHROME} osionos/1.0 Electron/31.0.0`;
export const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
export const PAGE_JWT = "e2e-page-jwt";

export function sessionRow(id, userAgent, extra = {}) {
  return {
    id, userAgent, current: false, createdAt: "2026-10-22T10:00:00.000Z", expiresAt: "2026-10-29T10:00:00.000Z",
    lastSeenAt: null, authMethod: "password", ipPrefix: "203.0.113.0/24", ...extra,
  };
}

/** Stubs the session routes and the logout. `failList` / `failDelete` answer that response until set back to null. */
export async function stubSessions(page, rows) {
  const state = { rows: [...rows], deletes: [], logouts: 0, failList: null, failDelete: null };
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/auth/bridge/logout") {
      state.logouts += 1;
      return { status: 204 };
    }
    const [, id] = url.pathname.match(/^\/api\/account\/sessions(?:\/([^/]+))?$/) ?? [];
    if (!url.pathname.startsWith("/api/account/sessions")) return undefined;
    if (request.method() === "GET") return state.failList ?? { json: { sessions: state.rows } };
    if (request.method() === "DELETE" && id) {
      if (state.failDelete) return state.failDelete;
      state.deletes.push(id);
      state.rows = state.rows.filter((row) => row.id !== id);
      return { status: 204 };
    }
    return undefined;
  });
  return state;
}

/** Loads the app, gives it a page JWT, a recorder for local sign-outs and, with `bridgeToken`, an app session that logout can send to the bridge, and opens Settings > Profile. */
export async function openProfile(page, baseURL, { bridgeToken = "" } = {}) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(([jwt, token]) => {
    globalThis.__signedOut = [];
    const store = globalThis.__playgroundUserStore;
    const { activeUserId, sessions } = store.getState();
    store.setState({
      activePageJwt: () => jwt,
      handleSessionRevoked: (revoked) => globalThis.__signedOut.push(revoked),
      ...(token ? { sessions: { ...sessions, [activeUserId]: { ...sessions[activeUserId], userId: activeUserId, accessToken: token } } } : {}),
    });
  }, [PAGE_JWT, bridgeToken]);
  await openSettings(page);
}

export const signedOutTokens = (page) => page.evaluate(() => globalThis.__signedOut);
