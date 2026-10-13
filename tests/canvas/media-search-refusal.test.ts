/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   media-search-refusal.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 01:55:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 01:55:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge answers 401 to a media search with no session and 429 to one past
// its rate limit. A picker tells the user which; every other failure stays what
// it was (offline, or the provider is down) and gets no such notice.

import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@osionos/http-gate";

import { searchRefusalNotice } from "../../src/shared/lib/media/searchRefusal.ts";

test("a 401 asks the user to sign in", () => {
  assert.equal(searchRefusalNotice(new ApiError("App session bearer token is required.", 401, "API_ERROR")), "Sign in to search online.");
});

test("a 429 asks the user to wait", () => {
  assert.equal(
    searchRefusalNotice(new ApiError("Too many requests", 429, "API_ERROR")),
    "Too many searches. Wait a few seconds, then try again.",
  );
});

test("an outage, a missing bridge URL or a provider error is not a refusal", () => {
  assert.equal(searchRefusalNotice(new ApiError("Unsplash search failed with 500", 502, "API_ERROR")), null);
  assert.equal(searchRefusalNotice(new ApiError("not configured", 503, "API_ERROR")), null);
  assert.equal(searchRefusalNotice(new Error("VITE_API_URL is not configured.")), null);
  assert.equal(searchRefusalNotice(new TypeError("Failed to fetch")), null);
  for (const notAnError of [null, undefined, "401", 401, { status: "401" }]) assert.equal(searchRefusalNotice(notAnError), null);
});
