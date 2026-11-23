// ADR 0064 PS35: a profile cover shown to anyone but its owner passes one validator, shared
// with the bridge: an image through the image-source rule, a gradient through a strict grammar
// that has no url(), var() or anything that leaves one CSS value. The profile reads
// `cover ?? bannerUrl` (PS36) and draws nothing when the result fails.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isSafeGradientCover, isSafeSharedCover } from "../../scripts/bridge-cover-rules.mjs";

const { profileCover, sharedCover } = await import("../../src/shared/lib/media/sharedCover.ts");

const gallery = JSON.parse(readFileSync(new URL("../../src/shared/lib/media/coverGallery.json", import.meta.url), "utf8"));
const galleryGradients: string[] = gallery.categories
  .flatMap((category: { items: { ref: string }[] }) => category.items.map((item) => item.ref))
  .filter((ref: string) => ref.includes("-gradient("));

const REFUSED_GRADIENTS = [
  "linear-gradient(red 0%, url(https://evil.example/x.png) 100%)",
  "linear-gradient(#000 0%, #fff 100%), url(https://evil.example/x.png)",
  "url(https://evil.example/x.png)",
  "linear-gradient(var(--x) 0%, #fff 100%)",
  "linear-gradient(#000 0%, #fff 100%); background: red",
  "linear-gradient(#000 0%, #fff 100%)}body{color:red",
  "linear-gradient(\"#000\" 0%, #fff 100%)",
  "linear-gradient(#000 0%, #fff 100%) /* x */",
  "linear-gradient(\\75 rl(x))",
  "linear-gradient(rgb(rgb(1, 2, 3)) 0%, #fff 100%)",
  "linear-gradient(expression(alert(1)))",
  "linear-gradient(image-set(x) 0%, #fff 100%)",
  "linear-gradient(#00000 0%, #fff 100%)",
  "linear-gradient((#000) 0%, #fff 100%)",
  "linear-gradient(#000 0%, #fff 100%",
  "repeating-linear-gradient(#000 0%, #fff 10%)",
  "conic-gradient(#000, #fff)",
  `linear-gradient(${"#000 0%, ".repeat(80)}#fff 100%)`,
];

test("every built-in gallery gradient is accepted", () => {
  assert.ok(galleryGradients.length >= 40, "the gallery still holds its gradients");
  for (const gradient of galleryGradients) assert.equal(isSafeGradientCover(gradient), true, gradient);
});

test("hand-written gradients inside the grammar are accepted", () => {
  for (const gradient of [
    "linear-gradient(to right, #000, #fff)",
    "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, transparent 70%)",
    "linear-gradient(0.25turn, hsl(210, 40%, 50%), #fff)",
  ]) assert.equal(isSafeGradientCover(gradient), true, gradient);
});

test("a gradient carrying url(), var(), a declaration break or nesting is refused", () => {
  for (const gradient of REFUSED_GRADIENTS) assert.equal(isSafeGradientCover(gradient), false, gradient);
});

test("an image cover is judged by the injected image rule, a gradient never reaches it", () => {
  const seen: string[] = [];
  const onlyHttps = (value: string) => { seen.push(value); return value.startsWith("https://"); };
  assert.equal(isSafeSharedCover("https://cdn.example/a.png", onlyHttps), true);
  assert.equal(isSafeSharedCover("javascript:alert(1)", onlyHttps), false);
  assert.equal(isSafeSharedCover("linear-gradient(#000 0%, #fff 100%)", onlyHttps), true);
  assert.equal(isSafeSharedCover("linear-gradient(url(https://x) 0%, #fff 100%)", () => true), false);
  assert.deepEqual(seen, ["https://cdn.example/a.png", "javascript:alert(1)"]);
});

test("a non-string, empty or oversized cover is refused", () => {
  for (const value of [null, undefined, 42, {}, "", "   ", `https://cdn.example/${"a".repeat(2100)}`]) {
    assert.equal(isSafeSharedCover(value, () => true), false, String(value).slice(0, 40));
  }
});

test("sharedCover uses the app's image rule: https and same-origin paths pass, script and off-site do not", () => {
  assert.equal(sharedCover("https://cdn.example/a.png"), "https://cdn.example/a.png");
  assert.equal(sharedCover("/api/media/avatars/u/a-banner.webp"), "/api/media/avatars/u/a-banner.webp");
  assert.equal(sharedCover("javascript:alert(1)"), null);
  assert.equal(sharedCover("//evil.example/a.png"), null);
  assert.equal(sharedCover("http://evil.example/a.png"), null);
  assert.equal(sharedCover("linear-gradient(red, url(https://evil.example/x))"), null);
  assert.equal(sharedCover(null), null);
});

test("profileCover reads the page cover first and the banner when the page has none (PS36)", () => {
  const banner = "https://cdn.example/banner.png";
  const cover = "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)";
  assert.equal(profileCover(cover, banner), cover);
  assert.equal(profileCover(undefined, banner), banner);
  assert.equal(profileCover(null, banner), banner);
  assert.equal(profileCover(undefined, null), null);
  assert.equal(profileCover("url(https://evil.example/x)", banner), null, "a refused cover is not replaced by the banner");
});
