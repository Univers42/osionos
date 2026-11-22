/**
 * The bridge's session check answers `sub`, lower-cased, as the user id. The client reads the
 * same claim from the page JWT to key the objectdb topic and to tell its own uploads from a
 * teammate's (osionos#233 D233-2); one reader, so the two can never disagree.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { getActivePageUserId } from "@/shared/api/client";

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const withPageJwt = (token: string | null) => Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activePageJwt: () => token, activeJwt: () => null }),
  subscribe: () => () => undefined,
});

test("the page JWT's sub, lower-cased", () => {
  withPageJwt(`h.${segment({ sub: "ABCDEF00-0000-4000-8000-000000000001" })}.s`);
  assert.equal(getActivePageUserId(), "abcdef00-0000-4000-8000-000000000001");
});

test("a url-safe payload decodes", () => {
  withPageJwt(`h.${segment({ sub: "u", pad: "??>>" })}.s`);
  assert.equal(getActivePageUserId(), "u");
});

test("no session, a malformed token, or no sub: null", () => {
  withPageJwt(null);
  assert.equal(getActivePageUserId(), null);
  withPageJwt("not-a-jwt");
  assert.equal(getActivePageUserId(), null);
  withPageJwt(`h.${segment({ sub: 7 })}.s`);
  assert.equal(getActivePageUserId(), null);
  withPageJwt("h.%%%.s");
  assert.equal(getActivePageUserId(), null);
});
