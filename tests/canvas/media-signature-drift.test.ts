// osionos#233 D233-1: the bridge strips signed media links on page writes with its own plain-node
// copy of the client's stripMediaSignature (it cannot import TypeScript). This test fails when the
// two disagree, on fixed vectors and on 2,000 seeded strings built from the URL's own pieces.
import assert from "node:assert/strict";
import test from "node:test";

import { stripMediaSignature } from "../../src/shared/lib/media/mediaSignature.ts";
// @ts-expect-error plain .mjs, no declaration file
import * as bridge from "../../scripts/bridge-media-sign.mjs";

const PATH = `/api/media/uploads/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/${"ab".repeat(32)}.png`;
const PIECES = [
  PATH, "?", "&", "&amp;", "exp=1", "kid=0a1b2c3d", `sig=${"9f".repeat(32)}`, "v=2", "#x", " ", '"', ")",
  "https://bridge.example", "/api/media/avatars/u/a.png", "sig=", "amp;", "\\", "<img src=\"", "![x](",
];
const MODULUS = 2147483647;
const MULTIPLIER = 48271;

function randomTexts(count: number): string[] {
  let seed = 20261122;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    seed = (seed * MULTIPLIER) % MODULUS;
    const tokens = 1 + (seed % 9);
    let value = "";
    for (let token = 0; token < tokens; token += 1) {
      seed = (seed * MULTIPLIER) % MODULUS;
      value += PIECES[seed % PIECES.length];
    }
    out.push(value);
  }
  return out;
}

test("the bridge copy strips exactly like the client", () => {
  const vectors = [`${PATH}?exp=1&kid=0a1b2c3d&sig=00`, `${PATH}?v=2&sig=1`, PATH, "", "sig=1"];
  for (const value of [...vectors, ...randomTexts(2000)]) {
    assert.equal(bridge.stripMediaSignature(value), stripMediaSignature(value), JSON.stringify(value));
  }
});
