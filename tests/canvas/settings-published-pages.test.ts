/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-published-pages.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P5-5-c: the "Published pages" settings panel — the registry entry that
 * replaced the public-pages mock, the status word, the public URL and the
 * client's body parsing.
 *
 * The panel itself is a .tsx and the canvas runner cannot import one (Node's
 * type stripping does not transform JSX), so the pure module beside it carries
 * what can be proved here: the status word, the URL builder and the body
 * parser the client module calls. The client MODULE cannot be imported either
 * — it reaches @/shared/api/client, whose `import.meta.env` read throws under
 * `node --experimental-strip-types` — so its call shape is read from the
 * source instead, the way the settings kit-adoption test reads its panels.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findSection, searchSettings } from "@/features/settings/model/sections";
import {
  isPublishedToken,
  parsePublishedPages,
  publicUrlFor,
  statusLabel,
} from "@/features/settings/public-pages/publishedPages";

const TOKEN = "0123456789abcdef0123456789abcdef";

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("the public_pages section is titled Published pages and keeps its anchor id", () => {
  const section = findSection("public_pages");
  assert.ok(section, "the public_pages section left the registry");
  assert.equal(section.label, "Published pages");
  assert.equal(section.title, "Published pages");
  assert.equal(section.subtitle, "The pages you published to the web");
  assert.equal(section.group, "features");
  // The anchor id stays "public-pages": saved deep links point at it.
  assert.equal(section.anchors[0].id, "public-pages");
  assert.equal(section.anchors[0].label, "Published pages");
});

test("the search finds the section by the words the panel is about", () => {
  for (const term of ["republish", "unpublish", "published", "snapshot"]) {
    const hits = searchSettings(term);
    assert.ok(
      hits.some((hit) => hit.section.id === "public_pages" && hit.anchor.id === "public-pages"),
      `searchSettings(${term}) does not find the published-pages anchor`,
    );
  }
});

test("the status word is Live for a current copy and Out of date for a stale one", () => {
  assert.equal(statusLabel("live"), "Live");
  assert.equal(statusLabel("outdated"), "Out of date");
});

test("the public URL is the app origin plus the token as a path segment", () => {
  assert.equal(publicUrlFor(TOKEN, "https://app.test"), `https://app.test/p/${TOKEN}`);
  // A trailing slash on the origin must not double the separator.
  assert.equal(publicUrlFor(TOKEN, "https://app.test/"), `https://app.test/p/${TOKEN}`);
});

test("a token that is not the bridge's shape never reaches an href", () => {
  for (const hostile of [
    "",
    "not-a-token",
    "0123456789ABCDEF0123456789ABCDEF", // upper case
    "0123456789abcdef0123456789abcde", // 31 characters
    "0123456789abcdef0123456789abcdeff", // 33 characters
    "../../etc/passwd",
    "0123456789abcdef0123456789abcde?", // a query string smuggled in
    "0123456789abcdef0123456789abcde#",
  ]) {
    assert.equal(isPublishedToken(hostile), false, `${hostile} is not the bridge's token shape`);
    assert.equal(publicUrlFor(hostile, "https://app.test"), null, `${hostile} built a URL`);
  }
});

test("the body parser drops a malformed row instead of throwing", () => {
  assert.deepEqual(parsePublishedPages(undefined), []);
  assert.deepEqual(parsePublishedPages(null), []);
  assert.deepEqual(parsePublishedPages("nope"), []);
  assert.deepEqual(parsePublishedPages(42), []);
  assert.deepEqual(parsePublishedPages({}), []);
  assert.deepEqual(parsePublishedPages({ ok: true, pages: "not-an-array" }), []);
  assert.deepEqual(parsePublishedPages({ ok: true, pages: [null, 7, "x"] }), []);
  // A row without a valid token is omitted; the rest of the list survives.
  const pages = parsePublishedPages({
    ok: true,
    pages: [
      { pageId: "p1", token: TOKEN, title: "Doc", icon: "📄", publishedAt: "2026-10-01T00:00:00.000Z", status: "live" },
      { pageId: "p2", token: "bogus", title: "Bad", icon: "", publishedAt: "2026-10-01T00:00:00.000Z", status: "live" },
      { pageId: "p3", token: "abcdef0123456789abcdef0123456789", title: "Second", icon: "", publishedAt: "2026-10-02T00:00:00.000Z", status: "outdated" },
    ],
  });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((page) => page.pageId), ["p1", "p3"]);
  assert.equal(pages[0].status, "live");
  assert.equal(pages[1].status, "outdated");
  // A row that cannot prove it is current is never shown as live.
  assert.equal(parsePublishedPages({ ok: true, pages: [{ pageId: "p4", token: TOKEN, status: "wat" }] })[0].status, "outdated");
});

test("the client module calls the bridge route with the page JWT", () => {
  const source = read("src/features/settings/public-pages/publishedPagesApi.ts");
  assert.match(
    source,
    /api\.get<[^>]*>\(\s*['"]\/api\/account\/published-pages['"]\s*,\s*getActivePageJwt\(\)/,
    "the client module does not call /api/account/published-pages with the page JWT",
  );
  // The account JWT is the wrong one: for a bridge session it is deliberately blank.
  assert.doesNotMatch(source, /getActiveJwt\(/, "the client module uses the session JWT, not the page JWT");
});
