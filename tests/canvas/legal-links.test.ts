// #294: the subject (III.2) requires the Privacy Policy and the Terms of Service to be reachable
// from inside the app. They live on the public site (opposite-osiris /legal/...), whose origin
// the build already carries as VITE_PRISMATICA_URL.

import assert from "node:assert/strict";
import test from "node:test";

import { legalLinks } from "../../src/features/legal/model/legalLinks.ts";

test("the public site's origin gives the privacy and terms pages", () => {
  assert.deepEqual(legalLinks("https://localhost:4322"), [
    { id: "privacy", label: "Privacy Policy", href: "https://localhost:4322/legal/privacy-policy/" },
    { id: "terms", label: "Terms of Service", href: "https://localhost:4322/legal/terms/" },
  ]);
});

test("a site served under a path keeps it, with or without a trailing slash", () => {
  assert.equal(legalLinks("https://example.test/site")[1]?.href, "https://example.test/site/legal/terms/");
  assert.equal(legalLinks("https://example.test/site/")[0]?.href, "https://example.test/site/legal/privacy-policy/");
});

test("no usable origin gives no links rather than a broken relative one", () => {
  for (const origin of ["", "   ", "/relative", "javascript:alert(1)", "not a url"]) {
    assert.deepEqual(legalLinks(origin), [], origin);
  }
});
