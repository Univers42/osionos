// The Whiteboard record's header showed "localhost:3007" on the tailnet: the seed stored a dev
// loopback URL as `website`, and the header's link slot printed whatever the record held. On a
// non-loopback page nothing may point at localhost (owner rule, 2026-11-04). A built-in app shows
// the URL this build is configured with, or nothing; any other link shows only if this page can
// reach it.

import assert from "node:assert/strict";
import test from "node:test";

import { websiteFor } from "@/features/marketplace/model/launchPolicy";
import { headerLinkHref } from "@/pages/notion-page/model/headerLink";
import type { PageEntry } from "@/entities/page";

const TAILNET = "baas.tail10f2ea.ts.net";

test("a built-in app shows its configured URL, whatever the record stored", () => {
  assert.equal(websiteFor("https://localhost:3008", "https://osionos.hydrawn-app.pages.dev", TAILNET), "https://osionos.hydrawn-app.pages.dev");
  assert.equal(websiteFor("https://localhost:3002", "", TAILNET), "", "no configured URL: the field is hidden");
  assert.equal(websiteFor("https://mail.example.net", "", TAILNET), "", "the build opted the app out");
});

test("any other app shows its stored website only when this page can reach it", () => {
  assert.equal(websiteFor("https://localhost:3001", null, TAILNET), "");
  assert.equal(websiteFor("https://localhost:3001", null, "localhost"), "https://localhost:3001");
  assert.equal(websiteFor("https://vendor.example.com", null, TAILNET), "https://vendor.example.com");
  assert.equal(websiteFor("", null, TAILNET), "");
});

const record = (identifier: string, website: string): PageEntry => ({
  _id: "p1", title: "App", properties: [
    { key: "identifier", label: "Identifier", type: "text", value: identifier },
    { key: "website", label: "Website", type: "url", value: website },
  ],
} as unknown as PageEntry);

test("the header's website link of a built-in app with no configured URL is hidden", () => {
  // Node runs the app's config unbuilt: VITE_WHITEBOARD_APP_URL is unset, so the configured URL is "".
  assert.equal(headerLinkHref(record("osionos.whiteboard", "https://localhost:3007"), "website", "https://localhost:3007", TAILNET), "");
});

test("any other header link hides a loopback URL on a non-loopback page and keeps the rest", () => {
  const page = record("", "");
  assert.equal(headerLinkHref(page, "homepage", "https://localhost:3007", TAILNET), "");
  assert.equal(headerLinkHref(page, "homepage", "https://localhost:3007", "localhost"), "https://localhost:3007");
  assert.equal(headerLinkHref(page, "homepage", "https://docs.example.com", TAILNET), "https://docs.example.com");
  assert.equal(headerLinkHref(page, "contact", "mailto:team@example.com", TAILNET), "mailto:team@example.com");
  assert.equal(headerLinkHref(page, "homepage", undefined, TAILNET), "");
});
