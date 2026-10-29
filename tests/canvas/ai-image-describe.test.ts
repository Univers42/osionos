/**
 * "Describe with AI" on an image block: the pure rules.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  addTag,
  canShowDescribe,
  describeErrorMessage,
  isFeatureOff,
  isDescribeOff,
  markDescribeOff,
  mergeDescription,
  normaliseImageDescription,
  removeTag,
  resetDescribeOff,
} from "@/features/ai/model/imageDescription";

test("normaliseImageDescription trims, lowercases, dedupes and drops empties", () => {
  const d = normaliseImageDescription({
    caption: "  A red bicycle ",
    tags: [" Bike ", "bike", "", "  ", "RED", 7],
    ocr: "  STOP \n",
  });
  assert.deepEqual(d, { alt: "A red bicycle", tags: ["bike", "red"], text: "STOP" });
});

test("normaliseImageDescription caps tags (10), tag length (40) and text (300)", () => {
  const d = normaliseImageDescription({
    caption: "x",
    tags: Array.from({ length: 15 }, (_, i) => `tag${i}`).concat(["z"]),
    ocr: "a".repeat(500),
  });
  assert.equal(d.tags.length, 10);
  assert.equal(d.text.length, 300);
  assert.equal(normaliseImageDescription({ tags: ["b".repeat(60)] }).tags[0].length, 40);
});

test("normaliseImageDescription survives garbage", () => {
  assert.deepEqual(normaliseImageDescription(null), { alt: "", tags: [], text: "" });
  assert.deepEqual(normaliseImageDescription({ caption: 3, tags: "x", ocr: {} }), { alt: "", tags: [], text: "" });
});

test("merge: no alt yet -> caption becomes the alt text, one update", () => {
  const m = mergeDescription({}, { alt: "A cat", tags: ["cat"], text: "hi" });
  assert.deepEqual(m.updates, { mediaAlt: "A cat", mediaTags: ["cat"], mediaText: "hi" });
  assert.equal(m.altSuggestion, null);
});

test("merge: existing alt is kept and the caption is only suggested", () => {
  const m = mergeDescription({ mediaAlt: "My own words" }, { alt: "A cat", tags: [], text: "" });
  assert.equal("mediaAlt" in m.updates, false);
  assert.equal(m.altSuggestion, "A cat");
});

test("merge: user tags stay first, new appended, capped at 10", () => {
  const user = ["mine", "keep"];
  const m = mergeDescription({ mediaTags: user }, { alt: "", tags: ["keep", "a", "b", "c", "d", "e", "f", "g", "h", "i"], text: "" });
  assert.deepEqual(m.updates.mediaTags?.slice(0, 3), ["mine", "keep", "a"]);
  assert.equal(m.updates.mediaTags?.length, 10);
});

test("merge: empty ocr leaves mediaText unset", () => {
  assert.equal("mediaText" in mergeDescription({}, { alt: "a", tags: [], text: "" }).updates, false);
});

test("addTag / removeTag normalise and cap", () => {
  assert.deepEqual(addTag(["a"], "  B "), ["a", "b"]);
  assert.deepEqual(addTag(["a"], "A"), ["a"]);
  assert.deepEqual(addTag(["a"], "  "), ["a"]);
  assert.equal(addTag(Array.from({ length: 10 }, (_, i) => `t${i}`), "new").length, 10);
  assert.deepEqual(removeTag(["a", "b"], "a"), ["b"]);
});

test("error codes map to user-facing messages, with Retry-After", () => {
  assert.equal(describeErrorMessage({ status: 422, code: "invalid_image" }), "This image type can't be described");
  assert.equal(describeErrorMessage({ status: 429, code: "rate_limited", retryAfter: "12" }), "The describer is busy — try again in 12 s");
  assert.equal(describeErrorMessage({ status: 503, code: "vlm_unavailable", retryAfter: "3.2" }), "The describer is busy — try again in 4 s");
  assert.match(describeErrorMessage({ status: 429, code: "vlm_busy" }), /try again in a moment/);
  assert.equal(describeErrorMessage({ status: 502, code: "vlm_bad_answer" }), "The model gave an unusable answer — try again");
  assert.equal(describeErrorMessage({ status: 500, code: "x" }), "Couldn't describe this image");
});

test("feature off: only 404 not_found, remembered, hides the action", () => {
  resetDescribeOff();
  assert.equal(isFeatureOff({ status: 404, code: "attachment_not_found" }), false);
  assert.equal(isFeatureOff({ status: 404, code: "not_found" }), true);
  const path = "/api/media/uploads/u/" + "a".repeat(64) + ".png";
  assert.equal(canShowDescribe(path), true);
  markDescribeOff();
  assert.equal(isDescribeOff(), true);
  assert.equal(canShowDescribe(path), false);
  resetDescribeOff();
});

test("the action shows only for capability paths", () => {
  resetDescribeOff();
  assert.equal(canShowDescribe(null), false);
});
