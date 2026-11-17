import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parse } from "@osionos/markdown-engine";
import { renderReact } from "@osionos/markdown-engine/react";

// The README HTML subset through the real React and react-dom/server (devil ruling
// U3-5, U3-7). The engine suite renders with a stubbed createElement, so this is
// where React's own attribute handling meets the policy.
// Caveat: the markup is read with the engine's regex invariants, not an HTML5
// parser: none is installed here, and adding one is a new dependency.

type Vector = readonly [string, string, string];
const require = createRequire(import.meta.url);
const SUPPORT = "../../packages/markdown-engine/tests/support/";
const { XSS_CORPUS } = require(`${SUPPORT}xssCorpus.cjs`) as { XSS_CORPUS: readonly Vector[] };
const { htmlProblems } = require(`${SUPPORT}htmlSubsetInvariants.cjs`) as {
  htmlProblems: (html: string) => string[];
};

const README = readFileSync(new URL("../fixtures/profile/github-readme.md", import.meta.url), "utf8");

function renderReadme(markdown: string, onCode: (lang: string) => void = () => undefined): string {
  const elements = renderReact(parse(markdown, { htmlSubset: true }), {
    htmlSubset: { mediaPrefixes: ["/api/media/uploads/"] },
    codeBlockRenderer: (lang, code) => {
      onCode(lang);
      return React.createElement("pre", { "data-lang": lang }, code);
    },
  });
  return renderToStaticMarkup(React.createElement("div", null, ...elements));
}

const openTags = (markup: string, tag: string): string[] =>
  markup.match(new RegExp(`<${tag}(?=[\\s/>])[^>]*>`, "g")) ?? [];

test("U3-7 all 24 fixture images carry the remote-image policy, no crossorigin, no srcset", () => {
  const images = openTags(renderReadme(README), "img");
  assert.equal(images.length, 24);
  for (const image of images) {
    assert.match(image, /^<img src="https:\/\//, image);
    // React writes referrerPolicy= as given; HTML attribute names are case-blind.
    for (const policy of ['loading="lazy"', 'decoding="async"', 'referrerpolicy="no-referrer"']) {
      assert.ok(image.toLowerCase().includes(policy), `${policy} missing on ${image}`);
    }
    assert.doesNotMatch(image, /crossorigin|srcset/i, image);
  }
});

test("the fixture's tables, a fenced block in a cell, and details/summary/kbd render as elements", () => {
  const languages: string[] = [];
  const markup = renderReadme(README, (lang) => languages.push(lang));
  assert.equal(openTags(markup, "table").length, 3);
  assert.equal(openTags(markup, "td").length, 13);
  assert.deepEqual(languages, ["c"]);
  assert.equal(openTags(markup, "details").length, 1);
  assert.equal(openTags(markup, "summary").length, 1);
  assert.equal(openTags(markup, "kbd").length, 4);
  assert.match(markup, /<h2 id="user-content-/);
  assert.deepEqual(htmlProblems(markup), []);
});

test(`U3-5 the XSS corpus (${XSS_CORPUS.length} vectors) through real React keeps every invariant`, () => {
  const failures = XSS_CORPUS.flatMap(([kind, label, markdown]) => {
    const problems = htmlProblems(renderReadme(markdown));
    return problems.length === 0 ? [] : [`${kind} ${label}: ${problems.join(", ")}`];
  });
  assert.deepEqual(failures, []);
});
