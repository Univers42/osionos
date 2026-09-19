/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-editor-palette.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildEditorTheme, composite, normalizeColor, relativeLuminance, resolveEditorColors, withAlpha, type EditorTokenInput } from "../../src/features/ide/ui/editorPalette.ts";

// Monaco's defineTheme() takes literal colors; the editor's palette is CSS custom
// properties resolved at runtime. This is the pure conversion between the two —
// the whole 7-palette × 2-theme system rides on it.

const SYNTAX = { keyword: "#B5532E", string: "#287D3C", comment: "#8C877D", function: "#7156A5", number: "#1F6FB2", literal: "#6B4A2E", property: "#1F6FB2", type: "#9A5418", tag: "#287D3C", attr: "#7156A5" };
const blank = (): EditorTokenInput => ({
  bg: "", fg: "", fgMuted: "", border: "", chipBg: "", headerBg: "", accent: "", danger: "", warning: "", selection: "", activeLine: "", bracket: "",
  syntax: { ...SYNTAX }, effectiveBg: "", effectiveFg: "",
});

test("normalizeColor accepts every form getComputedStyle can hand back", () => {
  assert.equal(normalizeColor("#abc"), "#AABBCC");
  assert.equal(normalizeColor(" #0d1117 "), "#0D1117");
  assert.equal(normalizeColor("#0d1117ff"), "#0D1117FF");
  assert.equal(normalizeColor("rgb(230, 237, 243)"), "#E6EDF3");
  assert.equal(normalizeColor("rgba(56, 139, 253, 0.35)"), "#388BFD59");
  assert.equal(normalizeColor("rgb(56 139 253 / 50%)"), "#388BFD80");
  assert.equal(normalizeColor("rgba(0, 0, 0, 0)"), null, "transparent is 'nothing resolved'");
  assert.equal(normalizeColor(""), null);
  assert.equal(normalizeColor("var(--osio-accent)"), null, "an unresolved var() is not a color");
});

test("alpha and compositing helpers are exact on the channels", () => {
  assert.equal(withAlpha("#FFFFFF", 0.5), "#FFFFFF80");
  assert.equal(composite("#FFFFFF80", "#000000"), "#808080");
  assert.equal(composite("#FF000000", "#00FF00"), "#00FF00");
  assert.ok(relativeLuminance("#0D1117") < 0.02);
  assert.ok(relativeLuminance("#FBFCFD") > 0.95);
});

test("the dark code card yields a vs-dark base even under a light page theme", () => {
  const colors = resolveEditorColors({ ...blank(), bg: "#0d1117", fg: "#e6edf3", accent: "#CC785C" });
  assert.equal(colors.base, "vs-dark");
  assert.equal(colors.bg, "#0D1117");
  assert.equal(colors.selection, withAlpha("#CC785C", 0.28), "selection derives from the accent when the token is absent");
});

test("the IDE shell (no code-card tokens) resolves from the painted page background", () => {
  const colors = resolveEditorColors({ ...blank(), effectiveBg: "rgb(250, 250, 250)", effectiveFg: "rgb(31, 35, 40)", accent: "rgb(204, 120, 92)", danger: "#B42318" });
  assert.equal(colors.base, "vs");
  assert.equal(colors.bg, "#FAFAFA");
  assert.equal(colors.fg, "#1F2328");
  assert.equal(colors.danger, "#B42318");
  assert.equal(colors.fgMuted.length, 7, "line-number color is composited to an opaque value");
});

test("a translucent surface token is flattened over the painted background", () => {
  const colors = resolveEditorColors({ ...blank(), bg: "rgba(255, 255, 255, 0.5)", effectiveBg: "#000000", effectiveFg: "#FFFFFF" });
  assert.equal(colors.bg, "#808080");
});

test("nothing resolvable at all is a loud error, not an invented color", () => {
  assert.throws(() => resolveEditorColors(blank()), /neither a foreground nor a background/);
});

test("the theme carries every syntax role and the chrome keys Monaco needs", () => {
  const theme = buildEditorTheme(resolveEditorColors({ ...blank(), bg: "#0d1117", fg: "#e6edf3", accent: "#CC785C", danger: "#F2998C" }));
  assert.equal(theme.base, "vs-dark");
  assert.equal(theme.inherit, true);
  const rule = (token: string) => theme.rules.find((r) => r.token === token);
  assert.equal(rule("keyword")?.foreground, "B5532E");
  assert.equal(rule("comment")?.fontStyle, "italic");
  assert.equal(rule("invalid")?.foreground, "F2998C");
  assert.equal(rule("type.identifier")?.foreground, "9A5418");
  for (const key of ["editor.background", "editor.foreground", "editorCursor.foreground", "editor.selectionBackground", "editor.lineHighlightBackground", "editorBracketMatch.background", "editorSuggestWidget.background", "editorError.foreground"]) {
    assert.match(theme.colors[key] ?? "", /^#[0-9A-F]{6}([0-9A-F]{2})?$/, key);
  }
  assert.equal(theme.colors["editorCursor.foreground"], "#CC785C");
});
