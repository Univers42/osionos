/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tokensStub.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared setup for the personal-access-token specs: a fake /api/account/tokens that
// keeps its rows in memory, so a created token shows up in the next list and a revoked
// one stays gone. Every request body and the Authorization header are recorded.

import { stubBridge } from "./bridgeStub.mjs";
import { openSettings } from "./settingsHelpers.mjs";

export const CATALOG = { resources: { pages: { attributes: ["title", "icon", "content"] } }, permissions: ["read", "write"] };
export const SECRET = "osio_pat_e2e_0123456789abcdef";

export function tokenRow(id, name, extra = {}) {
  return { id, name, kind: "classic", scopes: ["pages:read"], grants: [], createdAt: "2026-10-01T10:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z", revokedAt: null, ...extra };
}

/** Stubs the token routes. `failList` makes the list answer 500 until set back to null. */
export async function stubTokens(page, rows) {
  const state = { rows: [...rows], posts: [], deletes: [], auth: [], failList: null, failDelete: null };
  await stubBridge(page, (url, request) => {
    // The home dashboard behind Settings reads the self-data sources in the background; an
    // unstubbed 503 there logs a load error whenever it lands before the test ends.
    const selfData = url.pathname.match(/^\/api\/account\/self-data\/(views\/)?([^/]+)/);
    if (selfData) return { json: selfData[1] ? { ok: true, source: selfData[2], views: {} } : { ok: true, source: selfData[2], columns: [], rows: [], truncated: false } };
    const [, id] = url.pathname.match(/^\/api\/account\/tokens(?:\/([^/]+))?$/) ?? [];
    if (!url.pathname.startsWith("/api/account/tokens")) return undefined;
    state.auth.push(request.headers().authorization);
    if (request.method() === "GET") {
      if (state.failList) return state.failList;
      return { json: { ok: true, tokens: state.rows, catalog: CATALOG } };
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      state.posts.push(body);
      const token = tokenRow("00000000-0000-4000-8000-0000000000aa", body.name, { kind: body.kind, scopes: body.scopes ?? [], expiresAt: body.expiresAt });
      state.rows.unshift(token);
      return { status: 201, json: { ok: true, token, secret: SECRET } };
    }
    if (request.method() === "DELETE") {
      if (state.failDelete) return state.failDelete;
      state.deletes.push(id ?? "all");
      state.rows = id ? state.rows.filter((row) => row.id !== id) : [];
      return { status: 204 };
    }
    return undefined;
  });
  return state;
}

/** Loads the app, gives it a page JWT, and opens Settings > Developer. */
export async function openDeveloper(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  await openSettings(page, "Developer");
}
