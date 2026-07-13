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
