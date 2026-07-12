/* ************************************************************************** */
/*  icon-catalog.test.ts — generated emoji/animated catalogs + tone compose   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { applyEmojiTone, EMOJI_SKIN_TONES } from "../../src/shared/lib/emoji/emojiTone.ts";
import {
  EMOJI_CATALOG_DATA,
  EMOJI_CATALOG_GROUPS,
} from "../../src/shared/ui/molecules/EmojiPicker/emojiCatalog.generated.ts";
import {
  NOTO_ANIMATED_BASE,
  NOTO_ANIMATED_DATA,
} from "../../src/shared/ui/molecules/IconPicker/notoAnimated.generated.ts";

test("applyEmojiTone: modifier inserted after the first code point", () => {
  assert.equal(EMOJI_SKIN_TONES.length, 5);
  assert.equal(applyEmojiTone("👍", 3), "👍🏽");
  assert.equal(applyEmojiTone("👍", 0), "👍");
  assert.equal(applyEmojiTone("👍", 99), "👍");
});

test("applyEmojiTone: drops a leading variation selector, keeps ZWJ tails", () => {
  // ✌️ = 270C FE0F → toned form has no FE0F after the base
  assert.equal(applyEmojiTone("\u{270C}\u{FE0F}", 1), "\u{270C}\u{1F3FB}");
  // 🙋‍♂️ = 1F64B ZWJ 2642 FE0F → modifier goes between base and ZWJ sequence
  assert.equal(
    applyEmojiTone("\u{1F64B}\u{200D}\u{2642}\u{FE0F}", 5),
    "\u{1F64B}\u{1F3FF}\u{200D}\u{2642}\u{FE0F}",
  );
});

test("emoji catalog: full RGI set, well-formed lines, valid groups, no duplicates", () => {
  const lines = EMOJI_CATALOG_DATA.split("\n");
  assert.ok(lines.length > 1800, `expected >1800 emoji, got ${lines.length}`);
  assert.equal(EMOJI_CATALOG_GROUPS.length, 9);
  const seen = new Set<string>();
  for (const line of lines) {
    const fields = line.split("|");
    assert.equal(fields.length, 4, `malformed line: ${line}`);
    const [glyph, name, group, tone] = fields;
    assert.ok(glyph.length > 0 && name.length > 0, `empty field: ${line}`);
    assert.ok(Number(group) >= 0 && Number(group) < EMOJI_CATALOG_GROUPS.length, `bad group: ${line}`);
    assert.ok(tone === "0" || tone === "1", `bad tone flag: ${line}`);
    assert.ok(!seen.has(glyph), `duplicate glyph: ${glyph}`);
    seen.add(glyph);
  }
  assert.ok(lines[0].startsWith("😀|grinning face|0|"));
});

test("emoji catalog: tone flags match known tone-capable emoji", () => {
  const flagFor = (glyph: string) =>
    EMOJI_CATALOG_DATA.split("\n").find((l) => l.startsWith(`${glyph}|`))?.split("|")[3];
  assert.equal(flagFor("👍"), "1");
  assert.equal(flagFor("😀"), "0");
});

test("noto animated catalog: well-formed url-segment entries, no duplicates", () => {
  assert.ok(NOTO_ANIMATED_BASE.startsWith("https://fonts.gstatic.com/"));
  const lines = NOTO_ANIMATED_DATA.split("\n");
  assert.ok(lines.length > 800, `expected >800 animated emoji, got ${lines.length}`);
  const seen = new Set<string>();
  for (const line of lines) {
    const [cp, name] = line.split("|");
    assert.match(cp, /^[0-9a-f_]+$/, `bad codepoint segment: ${line}`);
    assert.ok(name.length > 0, `missing name: ${line}`);
    assert.ok(!seen.has(cp), `duplicate codepoint: ${cp}`);
    seen.add(cp);
  }
});
