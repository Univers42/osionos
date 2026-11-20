// ADR 0069 BG3: the bridge answers image-source questions through its own plain-node
// copy of the client's validator, which cannot import the client's TypeScript. This
// test fails when the two disagree — on every vector of image-source.test.ts, and on
// 2,000 seeded random strings built from an alphabet of the hostile characters.
import assert from "node:assert/strict";
import test from "node:test";

import { classifyImageSource, MAX_IMAGE_SOURCE_LENGTH, sanitizeBackdropSource } from "../../src/shared/lib/media/imageSource.ts";
// @ts-expect-error plain .mjs, no declaration file
import * as bridge from "../../scripts/bridge-image-source.mjs";

const ORIGINS = { app: "https://app.example", bridge: "http://localhost:4000" };

const VECTORS: unknown[] = [
  "https://cdn.example/a.png",
  "HTTPS://cdn.example/a.png",
  "/api/media/uploads/u/k.png",
  "/img/a.png",
  "http://localhost:4000/api/media/uploads/u/k.png",
  "/\\evil.example/p.png",
  "/\t/evil.example/p.png",
  "/\n/evil.example",
  "//evil.example/p.png",
  "http://evil.example/p.png",
  "http://localhost:4000/other",
  "data:image/png;base64,AAAA",
  "blob:https://app.example/x",
  "javascript:alert(1)",
  "https://u:p@cdn.example/a.png",
  "linear-gradient(red, blue)",
  "",
  null,
  42,
  `https://cdn.example/${"a".repeat(2049 - "https://cdn.example/".length)}`,
  "https://cdn.example/a.mp4",
];

// A seeded Lehmer LCG: plain integer arithmetic, no dependency, and the same
// 2,000 strings on every run, so a failure is reproducible from its message.
const ALPHABET = ["/", "\\", "\t", "h", "t", "p", "s", ":", ".", "a", "u", "@", "api", "media", "uploads"];
const MODULUS = 2147483647;
const MULTIPLIER = 48271;

function randomSources(count: number): string[] {
  let seed = 20261120;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    seed = (seed * MULTIPLIER) % MODULUS;
    const tokens = 1 + (seed % 32);
    let value = "";
    for (let token = 0; token < tokens; token += 1) {
      seed = (seed * MULTIPLIER) % MODULUS;
      value += ALPHABET[seed % ALPHABET.length];
    }
    out.push(value);
  }
  return out;
}

const label = (value: unknown): string => JSON.stringify(value);

test("the bridge copy keeps the same length bound", () => {
  assert.equal(bridge.MAX_IMAGE_SOURCE_LENGTH, MAX_IMAGE_SOURCE_LENGTH);
});

test("client and bridge classify and sanitize every vector identically", () => {
  for (const value of VECTORS) {
    assert.deepEqual(bridge.classifyImageSource(value, ORIGINS), classifyImageSource(value, ORIGINS), label(value));
    assert.deepEqual(bridge.sanitizeBackdropSource(value, ORIGINS), sanitizeBackdropSource(value, ORIGINS), label(value));
  }
});

test("client and bridge answer identically on 2000 seeded random strings", () => {
  for (const value of randomSources(2000)) {
    assert.deepEqual(bridge.classifyImageSource(value, ORIGINS), classifyImageSource(value, ORIGINS), label(value));
    assert.deepEqual(bridge.sanitizeBackdropSource(value, ORIGINS), sanitizeBackdropSource(value, ORIGINS), label(value));
  }
});
