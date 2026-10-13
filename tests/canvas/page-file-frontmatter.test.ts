/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-frontmatter.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { joinFrontMatter, splitFrontMatter, FRONT_MATTER_KEY_RE } from "../../src/features/page-file/model/frontMatter.ts";

function deepEqual(a: unknown, b: unknown): void {
  assert.deepStrictEqual(a, b);
}

function assertRoundTrip(meta: Record<string, unknown>, body: string, description: string): void {
  test(description, () => {
    const joined = joinFrontMatter(meta, body);
    const split = splitFrontMatter(joined);
    const expectedMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && JSON.stringify(v) !== undefined) {
        expectedMeta[k] = v;
      }
    }
    deepEqual(split, {
      meta: expectedMeta,
      body,
      error: null,
      present: true,
    });
  });
}

// ===== Round-trip tests =====

test("round-trip: empty meta, empty body", () => {
  assertRoundTrip({}, "", "empty meta, empty body");
});

test("round-trip: empty meta, body 'x'", () => {
  assertRoundTrip({}, "x", "empty meta, body 'x'");
});

test("round-trip: empty meta, body '\\n'", () => {
  assertRoundTrip({}, "\n", "empty meta, body '\\n'");
});

test("round-trip: empty meta, body '\\nx'", () => {
  assertRoundTrip({}, "\nx", "empty meta, body '\\nx'");
});

test("round-trip: empty meta, body 'a\\r\\nb'", () => {
  assertRoundTrip({}, "a\r\nb", "empty meta, body 'a\\r\\nb'");
});

test("round-trip: empty meta, body with front-matter-like content", () => {
  assertRoundTrip({}, "---\nfoo: 1\n---\n", "empty meta, body with front-matter-like content");
});

test("round-trip: string values with special chars", () => {
  assertRoundTrip({ s: 'hello "world"\nnewline' }, "body", 'string with quotes and newline');
});

test("round-trip: unicode string", () => {
  assertRoundTrip({ s: "é😀" }, "body", "unicode string");
});

test("round-trip: numbers", () => {
  assertRoundTrip({ n: 0, neg: -1.5, int: 42 }, "body", "numbers including 0 and -1.5");
});

test("round-trip: booleans", () => {
  assertRoundTrip({ t: true, f: false }, "body", "booleans");
});

test("round-trip: null", () => {
  assertRoundTrip({ n: null }, "body", "null value");
});

test("round-trip: nested object", () => {
  assertRoundTrip({ obj: { a: 1, b: "two" } }, "body", "nested object");
});

test("round-trip: array", () => {
  assertRoundTrip({ arr: [1, "two", null, true] }, "body", "array");
});

// ===== joinFrontMatter exact output tests =====

test("join: known input byte-exact", () => {
  const result = joinFrontMatter({ b: 2, a: 1 }, "body");
  assert.strictEqual(result, "---\n" + 'a: 1\n' + 'b: 2\n' + "---\n\nbody");
});

test("join: key order independent of insertion order", () => {
  const r1 = joinFrontMatter({ z: 1, a: 2 }, "");
  const r2 = joinFrontMatter({ a: 2, z: 1 }, "");
  assert.strictEqual(r1, r2);
});

test("join: undefined values omitted", () => {
  const result = joinFrontMatter({ a: 1, b: undefined, c: 3 }, "");
  assert.strictEqual(result, "---\n" + 'a: 1\n' + 'c: 3\n' + "---\n");
});

test("join: JSON.stringify undefined values omitted", () => {
  // Functions and symbols stringify to undefined
  const result = joinFrontMatter({ a: 1, b: () => {}, c: Symbol("x"), d: 2 }, "");
  assert.strictEqual(result, "---\n" + 'a: 1\n' + 'd: 2\n' + "---\n");
});

test("join: empty meta produces '---\\n---\\n'", () => {
  const result = joinFrontMatter({}, "");
  assert.strictEqual(result, "---\n---\n");
});

test("join: empty meta with body produces '---\\n---\\n\\n' + body", () => {
  const result = joinFrontMatter({}, "body");
  assert.strictEqual(result, "---\n---\n\nbody");
});

// ===== No front-matter tests =====

test("split: no front-matter 'hello'", () => {
  const result = splitFrontMatter("hello");
  deepEqual(result, { meta: {}, body: "hello", error: null, present: false });
});

test("split: no front-matter empty string", () => {
  const result = splitFrontMatter("");
  deepEqual(result, { meta: {}, body: "", error: null, present: false });
});

test("split: no front-matter '---' (no newline)", () => {
  const result = splitFrontMatter("---");
  deepEqual(result, { meta: {}, body: "---", error: null, present: false });
});

test("split: no front-matter '--- \n' (space before newline)", () => {
  const result = splitFrontMatter("--- \n");
  deepEqual(result, { meta: {}, body: "--- \n", error: null, present: false });
});

// ===== CRLF handling =====

test("split: CRLF file", () => {
  const text = "---\r\nid: \"a\"\r\n---\r\n\r\nbody";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: { id: "a" }, body: "body", error: null, present: true });
});

// ===== Blank lines inside block =====

test("split: blank lines inside block are skipped", () => {
  const text = "---\n\na: 1\n\nb: 2\n\n---\nbody";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: { a: 1, b: 2 }, body: "body", error: null, present: true });
});

// ===== Failure cases =====

test("split: unterminated block", () => {
  const text = "---\na: 1\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter: no closing ---", present: false });
});

test("split: bad key with hyphen", () => {
  const text = "---\na-b: 1\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 2: bad key: a-b", present: false });
});

test("split: key without ': '", () => {
  const text = "---\nkey 1\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: 'front-matter line 2: missing ": "', present: false });
});

test("split: invalid JSON value", () => {
  const text = "---\nk: {oops\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 2: invalid JSON", present: false });
});

test("split: duplicate key", () => {
  const text = "---\nk: 1\nk: 2\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 3: duplicate key: k", present: false });
});

test("split: __proto__ forbidden key", () => {
  const text = "---\n__proto__: {}\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 2: forbidden key: __proto__", present: false });
});

test("split: constructor forbidden key", () => {
  const text = "---\nconstructor: {}\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 2: forbidden key: constructor", present: false });
});

test("split: prototype forbidden key", () => {
  const text = "---\nprototype: {}\n---\n";
  const result = splitFrontMatter(text);
  deepEqual(result, { meta: {}, body: text, error: "front-matter line 2: forbidden key: prototype", present: false });
});

// ===== __proto__ pollution test =====

test("split: __proto__ attempt does not pollute Object.prototype", () => {
  const text = "---\n__proto__: {\"polluted\":1}\n---\n";
  splitFrontMatter(text);
  // @ts-expect-error - testing pollution
  assert.strictEqual(({}).polluted, undefined);
});

// ===== Large body test =====

test("split: 2 MB body splits correctly", () => {
  const body = "x".repeat(2 * 1024 * 1024);
  const text = joinFrontMatter({ id: "test" }, body);
  const result = splitFrontMatter(text);
  assert.strictEqual(result.body.length, body.length);
  assert.strictEqual(result.body, body);
  assert.strictEqual(result.error, null);
  assert.strictEqual(result.present, true);
});

// ===== join throws TypeError for invalid keys =====

test("join: throws TypeError for key with hyphen", () => {
  assert.throws(() => joinFrontMatter({ "a-b": 1 }, ""), TypeError);
});

test("join: throws TypeError for __proto__ key", () => {
  const obj = Object.create(null);
  obj.__proto__ = {};
  assert.throws(() => joinFrontMatter(obj, ""), TypeError);
});

test("join: throws TypeError for constructor key", () => {
  assert.throws(() => joinFrontMatter({ constructor: {} }, ""), TypeError);
});

test("join: throws TypeError for prototype key", () => {
  assert.throws(() => joinFrontMatter({ prototype: {} }, ""), TypeError);
});

// ===== FRONT_MATTER_KEY_RE tests =====

test("FRONT_MATTER_KEY_RE: valid keys", () => {
  assert.ok(FRONT_MATTER_KEY_RE.test("a"));
  assert.ok(FRONT_MATTER_KEY_RE.test("_"));
  assert.ok(FRONT_MATTER_KEY_RE.test("a1"));
  assert.ok(FRONT_MATTER_KEY_RE.test("_private"));
  assert.ok(FRONT_MATTER_KEY_RE.test("camelCase"));
  assert.ok(FRONT_MATTER_KEY_RE.test("snake_case"));
});

test("FRONT_MATTER_KEY_RE: invalid keys", () => {
  assert.ok(!FRONT_MATTER_KEY_RE.test(""));
  assert.ok(!FRONT_MATTER_KEY_RE.test("1abc"));
  assert.ok(!FRONT_MATTER_KEY_RE.test("a-b"));
  assert.ok(!FRONT_MATTER_KEY_RE.test("a.b"));
  assert.ok(!FRONT_MATTER_KEY_RE.test("a b"));
  // __proto__ matches the regex (valid format) but is forbidden separately
  assert.ok(FRONT_MATTER_KEY_RE.test("__proto__"));
});