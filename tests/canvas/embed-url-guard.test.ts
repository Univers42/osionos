/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-url-guard.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  appForbiddenOrigins,
  displayHost,
  frameableEmbedUrl,
  safeHttpUrl,
} from "../../src/shared/lib/embed/embedUrlGuard.ts";

test("safeHttpUrl normalizes absolute http(s) URLs", () => {
  assert.equal(safeHttpUrl("https://example.test/a?b=1#c"), "https://example.test/a?b=1#c");
  assert.equal(safeHttpUrl("  HTTP://Example.test  "), "http://example.test/");
  assert.equal(safeHttpUrl("https://example.test:8443/x"), "https://example.test:8443/x");
});

test("safeHttpUrl refuses scripts, data, blobs, files and every non-http scheme", () => {
  const refused = [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://example.test/uuid",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "ftp://example.test/",
    "app://osionos/",
    "about:blank",
  ];
  for (const url of refused) assert.equal(safeHttpUrl(url), "", JSON.stringify(url));
});

test("safeHttpUrl refuses relative, protocol-relative, empty and malformed forms", () => {
  const refused = ["", "   ", "/path", "path/only", "//evil.example/x", "https:evil.example", "https:\\\\evil.example", "https://", "http://[", "example.test"];
  for (const url of refused) assert.equal(safeHttpUrl(url), "", JSON.stringify(url));
});

test("safeHttpUrl refuses userinfo", () => {
  assert.equal(safeHttpUrl("https://user:pass@example.test/"), "");
  assert.equal(safeHttpUrl("https://user@example.test/"), "");
  assert.equal(safeHttpUrl("https://example.test@evil.example/"), "");
});

test("safeHttpUrl refuses more than 2048 characters, accepts exactly 2048", () => {
  const prefix = "https://example.test/";
  assert.equal(safeHttpUrl(prefix + "a".repeat(2048 - prefix.length)).length, 2048);
  assert.equal(safeHttpUrl(prefix + "a".repeat(2049 - prefix.length)), "");
});

test("frameableEmbedUrl refuses the app's own origins, including default-port spellings", () => {
  const forbidden = ["https://app.example", "http://localhost:3000"];
  assert.equal(frameableEmbedUrl("https://app.example/page", forbidden), "");
  assert.equal(frameableEmbedUrl("HTTPS://APP.example:443/page", forbidden), "");
  assert.equal(frameableEmbedUrl("http://localhost:3000/x", forbidden), "");
  assert.equal(frameableEmbedUrl("https://other.example/page", forbidden), "https://other.example/page");
  assert.equal(frameableEmbedUrl("http://localhost:3001/x", forbidden), "http://localhost:3001/x");
  assert.equal(frameableEmbedUrl("javascript:alert(1)", forbidden), "");
  assert.equal(frameableEmbedUrl("https://u:p@other.example/", []), "");
});

test("appForbiddenOrigins is an empty list outside a browser (no location, no env)", () => {
  assert.deepEqual(appForbiddenOrigins(), []);
});

test("displayHost shows the punycode host of what is actually framed, www stripped", () => {
  assert.equal(displayHost("https://xn--bcher-kva.example/"), "xn--bcher-kva.example");
  assert.equal(displayHost("https://bücher.example/"), "xn--bcher-kva.example");
  assert.equal(displayHost("https://www.example.test/a"), "example.test");
  assert.equal(displayHost("https://www.www.example.test/a"), "www.example.test");
  assert.equal(displayHost("javascript:alert(1)"), "");
  assert.equal(displayHost("https://u:p@example.test/"), "");
});
