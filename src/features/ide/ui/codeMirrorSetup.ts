/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   codeMirrorSetup.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * ONE editor theme + highlight style, driven entirely by CSS custom properties,
 * so it follows the app's light/dark theme AND all 7 palettes with ZERO JS
 * theme-branching (the whole reason CodeMirror was chosen over Monaco). The
 * chrome reuses the existing `--osio-code-*` tokens (the dark code-card look —
 * exactly the JetBrains/Android-Studio surface the user asked for); the syntax
 * colors reuse the existing `--osio-syntax-*` tokens that the read-only code
 * block already themes across every palette. The three `--osio-code-*` tokens
 * that don't exist yet get inline rgba fallbacks (this is a .ts object, not a
 * scanned CSS file). ponytail: promote the fallbacks to real tokens if a
 * designer wants to theme selection/active-line/bracket per palette.
 */
export const osioEditorTheme = EditorView.theme(
  {
    "&": {
      color: "var(--osio-code-fg)",
      backgroundColor: "var(--osio-code-bg)",
      height: "100%",
      fontSize: "13px",
    },
    ".cm-content": {
      fontFamily: "var(--osio-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
      caretColor: "var(--osio-accent)",
      padding: "10px 0",
    },
    ".cm-scroller": { overflow: "auto", lineHeight: "1.6" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--osio-accent)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--osio-code-selection, rgba(120, 150, 255, 0.28))",
    },
    ".cm-gutters": {
      backgroundColor: "var(--osio-code-bg)",
      color: "var(--osio-code-fg-muted)",
      border: "none",
      borderRight: "1px solid var(--osio-code-border)",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 18px", minWidth: "24px" },
    ".cm-activeLine": { backgroundColor: "var(--osio-code-active-line, rgba(127, 127, 127, 0.10))" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--osio-code-fg)" },
    ".cm-foldGutter .cm-gutterElement": { color: "var(--osio-code-fg-muted)" },
    ".cm-matchingBracket": {
      backgroundColor: "var(--osio-code-bracket, rgba(120, 150, 255, 0.22))",
      outline: "1px solid var(--osio-code-border)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--osio-code-chip-bg)",
      border: "1px solid var(--osio-code-border)",
      color: "var(--osio-code-fg-muted)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--osio-code-header-bg)",
      border: "1px solid var(--osio-code-border)",
      color: "var(--osio-code-fg)",
    },
  },
  { dark: true },
);

/** Lezer highlight tags → the existing `--osio-syntax-*` tokens (10 colors). */
export const osioHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self], color: "var(--osio-syntax-keyword)" },
  { tag: [t.string, t.special(t.string), t.character, t.regexp], color: "var(--osio-syntax-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--osio-syntax-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName, t.macroName], color: "var(--osio-syntax-function)" },
  { tag: [t.number, t.integer, t.float], color: "var(--osio-syntax-number)" },
  { tag: [t.bool, t.null, t.atom, t.constant(t.variableName)], color: "var(--osio-syntax-literal)" },
  { tag: [t.propertyName, t.attributeValue], color: "var(--osio-syntax-property)" },
  { tag: [t.typeName, t.className, t.namespace, t.typeOperator], color: "var(--osio-syntax-type)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--osio-syntax-tag)" },
  { tag: [t.attributeName], color: "var(--osio-syntax-attr)" },
  { tag: [t.meta, t.documentMeta, t.processingInstruction], color: "var(--osio-syntax-comment)" },
  { tag: t.heading, color: "var(--osio-syntax-keyword)", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--osio-syntax-function)", textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "var(--osio-danger, #ff6b6b)" },
]);

/**
 * The lean base extension set — editing, gutters, folding, bracket matching,
 * 4-space indent, history. Deliberately NO autocomplete/lint/search panel:
 * the user asked for "colors and be able to write code, no intellisense".
 * `closeBrackets` is bracket PAIRING, not completion — it stays.
 */
export function baseEditorExtensions(): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    indentUnit.of("    "),
    syntaxHighlighting(osioHighlightStyle),
    osioEditorTheme,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
  ];
}
