/**
 * ADR 0069 BG3: one URL-parsing validator for every image source a profile or a
 * block background may name. The table below is the policy; the bridge's copy
 * of it (scripts/bridge-image-source.mjs) is held to the same answers by
 * tests/canvas/image-source-drift.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { classifyImageSource, isProfileImageSource, sanitizeBackdropSource, type ImageOrigins } from "../../src/shared/lib/media/imageSource.ts";

const ORIGINS: ImageOrigins = { app: "https://app.example", bridge: "http://localhost:4000" };

const label = (value: unknown): string => JSON.stringify(value);

test("classifyImageSource: https, same-origin and bridge media are named", () => {
  const table: [unknown, string][] = [
    ["https://cdn.example/a.png", "https"],
    ["HTTPS://cdn.example/a.png", "https"],
    ["/api/media/uploads/u/k.png", "same-origin"],
    ["/img/a.png", "same-origin"],
    ["http://localhost:4000/api/media/uploads/u/k.png", "bridge-media"],
  ];
  for (const [value, kind] of table) {
    assert.equal(classifyImageSource(value, ORIGINS), kind, label(value));
    assert.ok(isProfileImageSource(value, ORIGINS), label(value));
  }
});

test("classifyImageSource: backslash, control and off-site shapes are refused", () => {
  const values: unknown[] = [
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
    // One character past MAX_IMAGE_SOURCE_LENGTH.
    `https://cdn.example/${"a".repeat(2049 - "https://cdn.example/".length)}`,
  ];
  for (const value of values) {
    assert.equal(classifyImageSource(value, ORIGINS), null, label(value));
    assert.equal(isProfileImageSource(value, ORIGINS), false, label(value));
  }
});

test("sanitizeBackdropSource: https and bridge uploads are kept, the rest refused", () => {
  assert.equal(sanitizeBackdropSource("https://cdn.example/a.png", ORIGINS), "https://cdn.example/a.png");
  assert.equal(sanitizeBackdropSource("/img/a.png", ORIGINS), null);
  assert.equal(sanitizeBackdropSource("/api/media/uploads/u/k.png", ORIGINS), "/api/media/uploads/u/k.png");
  assert.equal(sanitizeBackdropSource("https://cdn.example/a.mp4", ORIGINS), null);
});
