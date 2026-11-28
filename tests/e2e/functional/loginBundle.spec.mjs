/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   loginBundle.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sign-in gate ships none of the signed-in app: every .js the page requests before the
// SignedInApp chunk is asked for (the entry's static graph, which is all a signed-out visitor
// downloads) holds no page, database, seed or workbench module. The same regex matches a dev
// module path (NotionPage.tsx) and a built chunk (NotionPage-<hash>.js).
// Ponytail: the offline test build signs in at once, so "signed out" is read as "before the
// SignedInApp request"; a module the gate loaded dynamically after that point is not seen.

import { expect, test } from "@playwright/test";

const SIGNED_IN = /SignedInApp/;
const HEAVY = /(NotionPage|DatabaseBlock|knownDatabaseState|Workbench)[.-]/;

test("the sign-in gate requests no page, database, seed or workbench code", async ({ page, baseURL }) => {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  const requested = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\.(js|mjs|tsx?)(\?|$)/.test(url)) requested.push(url);
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-shell").waitFor();

  const cut = requested.findIndex((url) => SIGNED_IN.test(url));
  expect(cut, "the signed-in app is a separate chunk").toBeGreaterThan(0);
  const gate = requested.slice(0, cut);
  expect(gate.filter((url) => HEAVY.test(url))).toEqual([]);
});
