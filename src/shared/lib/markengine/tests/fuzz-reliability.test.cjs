"use strict";

// Seeded fuzz: the engine must never throw, hang, or destabilize on arbitrary
// input — delimiter soup, unclosed pairs, pathological runs. Deterministic
// (same LCG as markengine.test.js) so a failure is a repro, not a flake.

const test = require("node:test");
const assert = require("node:assert");
const { loadMarkengine } = require("./support/loadMarkengine.cjs");

const E = loadMarkengine();

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const DELIMITER_SOUP = "**__~~^^||``==[]()<>!#-:$\\|*_~%{}\"'@ \n\ta1.z";
const FRAGMENTS = [
  "**b**", "*i*", "___x___", "~~s~~", "==h==", "~2~", "^2^", "||s||",
  "`c`", "$m$", "[t](https://a.io)", "![a](https://a.io/x.png)", "[^1]",
  "<kbd>K</kbd>", "<sub>2</sub>", "<b>x</b>", "<!-- c -->", ":joy:",
  "# H", "> q", "- l", "1. o", "- [ ] t", "```js\nx\n```", "$$\ny\n$$",
  "| a | b |\n|---|---|", "Term\n: def", ":::columns", ":::column 0.5", ":::",
  "---", "[ref][1]", "[1]: https://a.io", "> [!note] hey", "> [>] tog", "##> th",
  "***a** b*", "****x****", "\\*lit\\*", "[color=#f00]c[/color]", "[b]t[/b]",
];

function randomSoup(random, length) {
  let out = "";
  while (out.length < length) {
    out += DELIMITER_SOUP[Math.floor(random() * DELIMITER_SOUP.length)];
  }
  return out;
}

function randomStructured(random) {
  const parts = [];
  const count = 1 + Math.floor(random() * 8);
  for (let i = 0; i < count; i++) {
    if (random() < 0.35) {
      parts.push(randomSoup(random, 1 + Math.floor(random() * 24)));
    } else {
      parts.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]);
    }
  }
  return parts.join(random() < 0.5 ? " " : "\n");
}

test("parse + every renderer never throw on 400 fuzzed documents", () => {
  const random = createRandom(0xf0075eed);
  for (let sample = 0; sample < 400; sample++) {
    const source =
      sample % 3 === 0
        ? randomSoup(random, 5 + Math.floor(random() * 300))
        : randomStructured(random);
    let blocks;
    assert.doesNotThrow(() => {
      blocks = E.parse(source);
    }, `parse threw on sample ${sample}: ${JSON.stringify(source)}`);
    assert.ok(Array.isArray(blocks));
    assert.doesNotThrow(() => E.renderHtml(blocks), `renderHtml sample ${sample}`);
    assert.doesNotThrow(
      () => E.renderTerminal(blocks, { color: false }),
      `renderTerminal sample ${sample}`,
    );
    assert.doesNotThrow(
      () => E.parseMarkdownToBlocks(source),
      `parseMarkdownToBlocks sample ${sample}`,
    );
  }
});

test("inline canonicalization converges (never oscillates) on 400 fuzzed lines", () => {
  // The editor's real invariant: canonicalizing SETTLES. Adversarial soup can
  // take a few passes (a stray "~" merging against a serialized "~x~" forms
  // "~~" once), but it must reach a fixed point — an input that canonicalizes
  // forever would livelock the editor's read-back loop.
  const random = createRandom(0xca11ab1e);
  const canonicalize = (text) => E.serializeInlineNodes(E.parseInline(text));
  const CONVERGENCE_BOUND = 8;
  for (let sample = 0; sample < 400; sample++) {
    const source = randomStructured(random).replaceAll("\n", " ");
    let current;
    assert.doesNotThrow(() => {
      current = canonicalize(source);
    }, `canonicalize threw on sample ${sample}: ${JSON.stringify(source)}`);
    let converged = false;
    for (let pass = 0; pass < CONVERGENCE_BOUND; pass++) {
      const next = canonicalize(current);
      if (next === current) {
        converged = true;
        break;
      }
      current = next;
    }
    assert.ok(
      converged,
      `canonicalization did not settle within ${CONVERGENCE_BOUND} passes on sample ${sample}: ${JSON.stringify(source)}`,
    );
  }
});

test("autoformat typing loop never throws and always terminates", () => {
  const random = createRandom(0x7e57ab1e);
  for (let sample = 0; sample < 200; sample++) {
    const text = randomStructured(random).replaceAll("\n", " ").slice(0, 80);
    let source = "";
    for (const ch of text) {
      source += ch;
      let result;
      assert.doesNotThrow(() => {
        result = E.autoformatInlineMarkdown(source, source.length);
      }, `autoformat threw on sample ${sample} at ${JSON.stringify(source)}`);
      if (result) source = result.source;
    }
  }
});
