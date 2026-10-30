/**
 * #228 spec C3: a suggestion's anchor is computed from the plain offsets the editor
 * reports, and it must land on the source it quotes for EVERY selection over formatted
 * text, or the composer refuses to send it. The reanchor/rebase rules are the ones the
 * SQL decide applies, over the same fixture.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applySuggestion,
  draftSuggestion,
  plainRangeForAnchor,
  rebaseSuggestion,
  reanchorSuggestion,
  visibleText,
  type SuggestionAnchor,
  type SuggestionDraft,
} from "@/features/comments/model/suggestionAnchor";

interface Fixture {
  reanchor: Array<{ name: string; source: string; anchor: SuggestionAnchor; expected: SuggestionAnchor | null }>;
  rebase: Array<{
    name: string;
    source: string;
    accepted: SuggestionDraft;
    nextSource: string;
    other: SuggestionAnchor;
    expected: SuggestionAnchor | null;
  }>;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/suggestion-anchors.json", import.meta.url), "utf8"),
) as Fixture;

const FORMATTED_SOURCES = [
  "hello world",
  "a [b]bold[/b] c",
  "[b]x [i]yz[/i] w[/b]",
  "see [docs](https://x.y) now",
  "run `npm i` now",
  "a 😀 b [i]é😀x[/i] 😀",
  "x [[page:abc]] y",
  "[color=#E03E3E]red[/color] and [bg=#0B6E99]blue[/bg]",
  "[u][s]under[/s][/u] [code]rich[/code]",
];
/** Plain positions a DOM selection can't take: inside the mention chip of "x [[page:abc]] y". */
const INSIDE_MENTION = (source: string, at: number) => source.includes("[[page:") && at > 2 && at < 14;

const splitsSurrogate = (text: string, at: number) =>
  at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at]);
const unselectable = (source: string, plain: string, at: number) =>
  splitsSurrogate(plain, at) || INSIDE_MENTION(source, at);

test("every fixture source round-trips through the engine", () => {
  for (const source of FORMATTED_SOURCES) assert.notEqual(visibleText(source), null, source);
});

test("every selection over formatted text lands on the source it quotes (C3)", () => {
  let checked = 0;
  for (const source of FORMATTED_SOURCES) {
    const plain = visibleText(source) ?? "";
    for (let start = 0; start <= plain.length; start += 1) {
      for (let end = start; end <= plain.length; end += 1) {
        if (unselectable(source, plain, start) || unselectable(source, plain, end)) continue;
        for (const typed of ["Z", ""]) {
          const draft = draftSuggestion(source, start, end, typed);
          const where = `${JSON.stringify(source)} [${start},${end}) ← ${JSON.stringify(typed)}`;
          if (start === end && !typed) {
            assert.equal(draft, null, where);
            continue;
          }
          assert.ok(draft, where);
          assert.equal([...source].slice(draft.anchor.start, draft.anchor.end).join(""), draft.anchor.quote, where);
          assert.equal(visibleText(applySuggestion(source, draft)), plain.slice(0, start) + typed + plain.slice(end), where);
          const range = plainRangeForAnchor(source, draft.anchor);
          assert.ok(range && range.start <= start && range.end >= end, `${where} highlights ${JSON.stringify(range)}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked} selections`);
});

test("a selection inside one formatting run stays inside it", () => {
  const draft = draftSuggestion("a [b]bold[/b] c", 2, 6, "new");
  assert.deepEqual(draft?.anchor, { start: 5, end: 9, quote: "bold", prefix: "a [b]", suffix: "[/b] c" });
  assert.equal(applySuggestion("a [b]bold[/b] c", draft!), "a [b]new[/b] c");
  assert.deepEqual(plainRangeForAnchor("a [b]bold[/b] c", draft!.anchor), { start: 2, end: 6 });

  const link = draftSuggestion("see [docs](https://x.y) now", 4, 8, "guide");
  assert.equal(applySuggestion("see [docs](https://x.y) now", link!), "see [guide](https://x.y) now");
});

test("a selection across a formatting edge widens to whole nodes and keeps the rest bold", () => {
  const draft = draftSuggestion("a [b]bold[/b] c", 0, 4, "X");
  assert.equal(draft?.anchor.quote, "a [b]bold[/b]");
  // The same source typing over that selection in the editor produces.
  assert.equal(applySuggestion("a [b]bold[/b] c", draft!), "[b]Xld[/b] c");
});

test("typed text takes the formatting before the caret", () => {
  assert.equal(applySuggestion("ab [b]cd[/b]", draftSuggestion("ab [b]cd[/b]", 3, 3, "X")!), "ab X[b]cd[/b]");
  assert.equal(applySuggestion("ab [b]cd[/b]", draftSuggestion("ab [b]cd[/b]", 5, 5, "X")!), "ab [b]cdX[/b]");
});

test("offsets are code points, with astral text before the anchor", () => {
  const draft = draftSuggestion("a 😀 b", 5, 6, "c");
  assert.deepEqual(draft?.anchor, { start: 4, end: 5, quote: "b", prefix: "a 😀 ", suffix: "" });
});

test("the composer refuses what the source can't carry", () => {
  assert.equal(draftSuggestion("hello", 0, 5, "[b]x[/b]"), null, "typed markup would show something else");
  assert.equal(draftSuggestion("hello", 2, 9, "x"), null, "a range past the end");
  assert.equal(draftSuggestion("a 😀", 3, 3, "x"), null, "an offset inside a surrogate pair");
  assert.equal(draftSuggestion("x [[page:abc]] y", 0, 3, "x"), null, "an offset inside a mention");
});

for (const item of fixture.reanchor) {
  test(`reanchor: ${item.name}`, () => {
    assert.deepEqual(reanchorSuggestion(item.source, item.anchor), item.expected);
  });
}

for (const item of fixture.rebase) {
  test(`rebase: ${item.name}`, () => {
    assert.equal(applySuggestion(item.source, item.accepted), item.nextSource);
    assert.deepEqual(rebaseSuggestion(item.other, item.accepted, item.nextSource), item.expected);
  });
}
