/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profilePageMocks.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared setup for the profile-page specs: a bridge origin for the offline build, a seeded
// session token, the mocked profile reads, and opening a profile from the command palette.

import { openFreshPage } from "../../browser/core/app.mjs";

export const OTHER = { id: "user-456", username: "bob" };

export const profileBody = (id, username, name, extra = {}) => ({
  userId: id, name, avatar: null, role: "Member", workspaceId: "ws-1",
  lastSeenAt: new Date().toISOString(), online: false, username, ...extra,
});

export const BOB_PUBLIC = {
  userId: OTHER.id, username: OTHER.username, displayName: "Bob Jones",
  pronouns: "he/him", company: "Design Co", location: "New York, NY",
  website: "https://bob.example.com/about", links: ["https://dribbble.com/bob"],
  timezone: "America/New_York", orcid: "0000-0002-1825-0097", patreon: "bobdraws",
  avatarUrl: null, bannerUrl: null,
};

// The offline build has no bridge origin, so api.get throws before fetching.
export async function giveTheAppABridgeOrigin(page, origin) {
  await page.route("**/src/shared/api/client.ts", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const patched = source.replace(/("VITE_API_URL":\s*)""/, `$1"${origin}"`);
    await route.fulfill({ response, body: patched });
  });
}

export async function seedSession(page) {
  return page.evaluate(() => {
    const store = globalThis.__playgroundUserStore;
    const state = store.getState();
    const sessions = { ...state.sessions };
    const mine = state.activeUserId || Object.keys(sessions)[0];
    sessions[mine] = { ...sessions[mine], accessToken: "e2e.profile.token" };
    store.setState({ sessions });
    return mine;
  });
}

export async function mockApi(page, { id, username, name, publicBody, profileExtra }, accountCalls = []) {
  await page.route(`**/api/profile/${id}`, (route) =>
    route.fulfill({ json: profileBody(id, username, name, profileExtra) }));
  await page.route(`**/api/users/${username}`, (route) =>
    publicBody ? route.fulfill({ json: publicBody }) : route.fulfill({ status: 500, body: "x" }));
  await page.route("**/api/account/**", (route) => { accountCalls.push(route.request().url()); route.fulfill({ status: 403, body: "{}" }); });
  await page.route("**/api/directory/search**", (route) =>
    route.fulfill({ json: { people: [{ id, name, username, avatar: null, headline: null, online: false }] } }));
}

// Bob's profile reads, for a `stubBridge` responder; undefined for anything else.
export function answerProfileReads(url) {
  if (url.pathname === `/api/profile/${OTHER.id}`) return { json: profileBody(OTHER.id, OTHER.username, "Bob Jones") };
  if (url.pathname === `/api/users/${OTHER.username}`) return { json: BOB_PUBLIC };
  if (url.pathname !== "/api/directory/search") return undefined;
  return { json: { people: [{ id: OTHER.id, name: "Bob Jones", username: OTHER.username, avatar: null, headline: null, online: false }] } };
}

export async function openProfileFromPalette(page, name) {
  const box = page.getByRole("combobox", { name: "Search pages or run a command" });
  await box.click();
  await box.fill(`user:${name}`);
  await page.getByRole("option").filter({ hasText: name }).first().click();
}

export async function openProfile(page, baseURL, name) {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  const mine = await seedSession(page);
  await openProfileFromPalette(page, name);
  return mine;
}

export const heading = (page, name) => page.getByRole("heading", { name, exact: true });
