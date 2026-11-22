/**
 * osionos#233 D233-8: the issues GET signs each screenshot it returns (`screenshot_url`), so
 * the panel shows and downloads that link; with no secret the bridge sends none and the panel
 * keeps the bare path, exactly as before.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { issueScreenshotSrc } from "@/features/issues/model/issueScreenshot";

const BASE = "https://bridge.example";
const PATH = "/api/media/uploads/11111111-1111-4111-8111-111111111111/" + "ab".repeat(32) + ".png";
const SIGNED = `${PATH}?exp=1700003600&kid=0a1b2c3d&sig=${"f".repeat(64)}`;

test("the signed link wins when the bridge sent one", () => {
  assert.equal(issueScreenshotSrc({ screenshot_path: PATH, screenshot_url: SIGNED }, BASE), `${BASE}${SIGNED}`);
});

test("no signed link: the bare path, as before", () => {
  assert.equal(issueScreenshotSrc({ screenshot_path: PATH }, BASE), `${BASE}${PATH}`);
});

test("no screenshot: null", () => {
  assert.equal(issueScreenshotSrc({ screenshot_path: null }, BASE), null);
});

test("a screenshot_url for another path is ignored", () => {
  const other = SIGNED.replace("ab".repeat(32), "cd".repeat(32));
  assert.equal(issueScreenshotSrc({ screenshot_path: PATH, screenshot_url: other }, BASE), `${BASE}${PATH}`);
  assert.equal(issueScreenshotSrc({ screenshot_path: PATH, screenshot_url: "https://evil.example/x.png" }, BASE), `${BASE}${PATH}`);
});
