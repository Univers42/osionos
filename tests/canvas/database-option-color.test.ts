/* ************************************************************************** */
/*  database-option-color.test.ts                                             */
/*  Unit tests for semantic select option colors, tagColorClass adapter,     */
/*  optionColorToCss, and getDotColor.                                        */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  TAG_COLORS,
  randomTagColor,
  tagColorClass,
  SEMANTIC_TAG_CLASSES,
} from "../../src/shared/notion-database-sys/src/constants/colors.ts";
import { optionColorToCss } from "../../src/shared/notion-database-sys/src/utils/color.ts";
import { getDotColor } from "../../src/shared/notion-database-sys/src/components/cellEditors/StatusCellEditor.tsx";

test("1. randomTagColor() returns one of TAG_COLORS (never contains bg- or text-)", () => {
  for (let i = 0; i < 50; i++) {
    const color = randomTagColor();
    assert.ok(TAG_COLORS.includes(color as (typeof TAG_COLORS)[number]), `Expected ${color} to be in TAG_COLORS`);
    assert.equal(color.includes("bg-"), false, `color ${color} should not contain 'bg-'`);
    assert.equal(color.includes("text-"), false, `color ${color} should not contain 'text-'`);
  }
});

test("2. tagColorClass('pink') returns 'bg-pink-surface-muted text-pink-text-tag'", () => {
  assert.equal(tagColorClass("pink"), "bg-pink-surface-muted text-pink-text-tag");
});

test("3. tagColorClass('red') returns 'bg-danger-surface-muted text-danger-text-tag'", () => {
  assert.equal(tagColorClass("red"), "bg-danger-surface-muted text-danger-text-tag");
});

test("4. tagColorClass('bg-danger-surface-muted text-danger-text-tag') returns legacy string unchanged", () => {
  assert.equal(
    tagColorClass("bg-danger-surface-muted text-danger-text-tag"),
    "bg-danger-surface-muted text-danger-text-tag",
  );
});

test("5. tagColorClass('') and tagColorClass(null) return SEMANTIC_TAG_CLASSES.default", () => {
  assert.equal(tagColorClass(""), SEMANTIC_TAG_CLASSES.default);
  assert.equal(tagColorClass(null), SEMANTIC_TAG_CLASSES.default);
  assert.equal(tagColorClass(undefined), SEMANTIC_TAG_CLASSES.default);
});

test("6. optionColorToCss('red') returns 'var(--color-danger)'", () => {
  assert.equal(optionColorToCss("red"), "var(--color-danger)");
});

test("7. optionColorToCss('blue') returns 'var(--color-accent)'", () => {
  assert.equal(optionColorToCss("blue"), "var(--color-accent)");
});

test("8. optionColorToCss('bg-danger-surface-muted text-danger-text-tag') returns 'var(--color-danger)'", () => {
  assert.equal(
    optionColorToCss("bg-danger-surface-muted text-danger-text-tag"),
    "var(--color-danger)",
  );
});

test("9. getDotColor('red') and getDotColor('bg-danger-surface-muted') return 'bg-danger'", () => {
  assert.equal(getDotColor("red"), "bg-danger");
  assert.equal(getDotColor("bg-danger-surface-muted"), "bg-danger");
});

test("10. getDotColor('blue') and getDotColor('bg-accent-subtle') return 'bg-accent'", () => {
  assert.equal(getDotColor("blue"), "bg-accent");
  assert.equal(getDotColor("bg-accent-subtle"), "bg-accent");
});

test("11. getDotColor('green') and getDotColor('bg-success-surface-medium') return 'bg-success'", () => {
  assert.equal(getDotColor("green"), "bg-success");
  assert.equal(getDotColor("bg-success-surface-medium"), "bg-success");
});
