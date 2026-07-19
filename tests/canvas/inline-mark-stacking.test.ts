/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inline-mark-stacking.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Inline styles must ACCUMULATE (bold + italic + underline …), and the sugar
// syntax must survive the intermediate states the user types through.

import assert from "node:assert/strict";
import test from "node:test";

import { autoformatInlineMarkdown } from "../../src/shared/lib/markengine/inlineAutoformat";
import { serializeInlineNodes } from "../../src/shared/lib/markengine/inlineAst";
import { parseInline } from "../../src/shared/lib/markengine/markdown/parserInline";

const canon = (src: string) => serializeInlineNodes(parseInline(src));
const auto = (src: string) => autoformatInlineMarkdown(src, src.length)?.source ?? null;

test("an over-long opening delimiter run leaves the surplus OUTSIDE the span (CommonMark)", () => {
  // Regression: "**" used to open at the FIRST star of "***hello**" and swallow the
  // third star into the content -> "[b]*hello[/b]". That stranded the "*" inside the
  // mark, so "***bold italic***" could never close: the final "*" landed outside it.
  assert.equal(canon("***hello**"), "*[b]hello[/b]");
  assert.equal(canon("___hello__"), "_[u]hello[/u]");
});

test("stacking the same delimiter gives bold+italic", () => {
  assert.equal(canon("***hello***"), "[b][i]hello[/i][/b]");
  // ...and the state the editor is in one keystroke earlier still closes correctly.
  assert.equal(auto("*[b]hello[/b]*"), "[i][b]hello[/b][/i]");
});

test("distinct delimiters nest, in either order and 3 deep", () => {
  assert.equal(canon("**__hello__**"), "[b][u]hello[/u][/b]");
  assert.equal(canon("__**hello**__"), "[u][b]hello[/b][/u]");
  assert.equal(canon("~~**hello**~~"), "[s][b]hello[/b][/s]");
  assert.equal(canon("***__hello__***"), "[b][i][u]hello[/u][/i][/b]");
});

test("single-run emphasis is unaffected", () => {
  assert.equal(canon("**hello**"), "[b]hello[/b]");
  assert.equal(canon("*hello*"), "[i]hello[/i]");
  assert.equal(canon("__hello__"), "[u]hello[/u]");
  assert.equal(canon("_hello_"), "[i]hello[/i]");
});

test("4+ delimiter runs nest pairs — there is no 4th style", () => {
  assert.equal(canon("****hello****"), "[b][b]hello[/b][/b]");
  assert.equal(canon("*****hello*****"), "[b][b][i]hello[/i][/b][/b]");
});

test("a run closes in parts, pairing like CommonMark", () => {
  assert.equal(canon("***a** b*"), "[i][b]a[/b] b[/i]");
  assert.equal(canon("***a* b**"), "[b][i]a[/i] b[/b]");
  assert.equal(canon("**a***b*"), "[b]a[/b]*b*");
});

test("emphasis inside emphasis survives, same or mixed marker", () => {
  assert.equal(canon("*a **b** c*"), "[i]a [b]b[/b] c[/i]");
  assert.equal(canon("_**x**_"), "[i][b]x[/b][/i]");
  assert.equal(canon("**_x_**"), "[b][i]x[/i][/b]");
});

test("code spans bind tighter than emphasis while typing", () => {
  assert.equal(canon("*em `code*` still*"), "[i]em `code*` still[/i]");
});

test("sub/kbd/spoiler round-trip through the canonical source form", () => {
  assert.equal(canon("H~2~O"), "H~2~O");
  assert.equal(canon("x^2^"), "x^2^");
  assert.equal(canon("<kbd>Ctrl</kbd>"), "<kbd>Ctrl</kbd>");
  assert.equal(canon("||secret||"), "||secret||");
});

/** The editor's live keystroke loop: append a char, let autoformat canonicalize.
 *  This is the exact source state machine EditableContent drives per input. */
function typeThrough(text: string): string {
  let source = "";
  for (const ch of text) {
    source += ch;
    const result = autoformatInlineMarkdown(source, source.length);
    if (result) source = result.source;
  }
  return source;
}

test("typing each combination char-by-char converges to canonical marks", () => {
  assert.equal(typeThrough("*i*"), "[i]i[/i]");
  assert.equal(typeThrough("**bold**"), "[b]bold[/b]");
  assert.equal(typeThrough("__under__"), "[u]under[/u]");
  assert.equal(typeThrough("***bold italic***"), "[b][i]bold italic[/i][/b]");
  assert.equal(typeThrough("___both___"), "[b][i]both[/i][/b]");
  assert.equal(typeThrough("****quad****"), "[b][b]quad[/b][/b]");
  assert.equal(typeThrough("**_x_**"), "[b][i]x[/i][/b]");
  assert.equal(typeThrough("~~strike~~"), "[s]strike[/s]");
  assert.equal(typeThrough("==mark=="), "[mark]mark[/mark]");
  assert.equal(typeThrough("H~2~O"), "H~2~O");
  assert.equal(typeThrough("x^2^"), "x^2^");
  assert.equal(typeThrough("||sec||"), "||sec||");
  assert.equal(typeThrough("<kbd>K</kbd>"), "<kbd>K</kbd>");
});

test("mid-run states hold raw — autoformat never fires on a partial close", () => {
  // "***bold italic*" parses as "**"+italic; firing there scrambles later stars.
  assert.equal(autoformatInlineMarkdown("***bold italic*", 15), null);
  assert.equal(autoformatInlineMarkdown("***bold italic**", 16), null);
  assert.equal(autoformatInlineMarkdown("___both__", 9), null);
  assert.equal(autoformatInlineMarkdown("~~strike~", 9), null);
});
