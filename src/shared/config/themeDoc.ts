/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeDoc.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A theme document: parsed field by field so one bad value costs that value and
// not the theme (the editor previews everything that is valid while a person
// types), checked against each token's kind, and compiled to the `--osio-*`
// properties themeApply writes on <html>. The structural half — what keeps a
// value inside one declaration and a document inside its size limit — is shared
// with the bridge (scripts/bridge-theme-rules.mjs), so the app never keeps what
// the bridge would refuse.

import {
  THEME_BASES,
  THEME_GROUPS,
  THEME_LIMITS,
  checkThemeShape,
  isSafeTokenValue,
} from "../../../scripts/bridge-theme-rules.mjs";

import { PALETTES } from "./theme";
import { themeToken, type ThemeGroup, type ThemeTokenKind } from "./themeTokens";

export interface ThemeDoc {
  name: string;
  base?: "light" | "dark";
  palette?: string;
  colors?: Record<string, string>;
  layout?: Record<string, string>;
  fonts?: Record<string, string>;
}

export interface ThemeIssue {
  path: string[];
  message: string;
  severity: "error" | "warning";
}

/** A theme as `<html>` receives it: the axes it pins and the properties it sets, keyed `--osio-<key>`. */
export interface CompiledTheme {
  base?: "light" | "dark";
  palette?: string;
  vars: Record<string, string>;
}

const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const FUNCTION_ARGS = String.raw`\([^()]*(?:\([^()]*\)[^()]*)*\)`;
const GRAMMAR: Record<ThemeTokenKind, { test: RegExp[]; property: string; expects: string }> = {
  color: {
    test: [/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, new RegExp(`^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)${FUNCTION_ARGS}$`, "i"), /^[a-z]{3,24}$/i],
    property: "color",
    expects: "a colour such as #1f6feb, rgb(31 111 235), oklch(0.6 0.15 250) or a colour name",
  },
  length: {
    test: [/^0$/, new RegExp(`^${NUM}(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex|dvh|svh|lvh)$`), new RegExp(`^(?:calc|min|max|clamp)${FUNCTION_ARGS}$`)],
    property: "width",
    expects: "a length such as 12px, 1.5rem, 50% or calc(100% - 2rem)",
  },
  number: { test: [new RegExp(`^${NUM}$`)], property: "line-height", expects: "a plain number such as 1.4 or 600" },
  font: { test: [/^(?=.*[a-z])[\w\s"',.-]+$/i], property: "font-family", expects: "a list of font names such as \"Inter\", sans-serif" },
  shadow: { test: [/^none$/, /^(?=.*\d)[0-9a-z.,%#\s()/+-]+$/i], property: "box-shadow", expects: "a shadow such as 0 1px 2px rgb(0 0 0 / 20%)" },
  duration: { test: [/^(?:\d+\.?\d*|\.\d+)(?:ms|s)$/], property: "transition-duration", expects: "a duration such as 120ms or .2s" },
  easing: {
    test: [
      /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/,
      new RegExp(`^cubic-bezier\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`),
      /^steps\(\s*\d+\s*(?:,\s*(?:start|end|jump-start|jump-end|jump-none|jump-both))?\s*\)$/,
    ],
    property: "transition-timing-function",
    expects: "an easing such as ease-out or cubic-bezier(.2, 0, 0, 1)",
  },
};

/** null when `value` is a valid value of a `kind` token, else what was expected. */
export function checkTokenValue(kind: ThemeTokenKind, value: string): string | null {
  const grammar = GRAMMAR[kind];
  if (!isSafeTokenValue(value)) {
    return `expects ${grammar.expects}, at most ${THEME_LIMITS.valueMax} characters, without ; { } < > \\ ! @, url( or var(`;
  }
  const matches = grammar.test.some((pattern) => pattern.test(value.trim()));
  // The browser's own parser has the last word where there is one (node has no CSS).
  const supported = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(grammar.property, value);
  return matches && supported ? null : `expects ${grammar.expects}`;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function parseGroup(group: ThemeGroup, tokens: unknown, issues: ThemeIssue[]): Record<string, string> | undefined {
  if (!isPlainObject(tokens)) {
    issues.push({ path: [group], message: "must be an object of token names to values", severity: "error" });
    return undefined;
  }
  if (Object.keys(tokens).length > THEME_LIMITS.keysPerGroup) {
    issues.push({ path: [group], message: `at most ${THEME_LIMITS.keysPerGroup} tokens`, severity: "error" });
    return undefined;
  }
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    const path = [group, key];
    const token = themeToken(key);
    if (!token) {
      issues.push({ path, message: `"${key}" is not a theme token; it is ignored`, severity: "warning" });
    } else if (token.group !== group) {
      issues.push({ path, message: `"${key}" belongs in ${token.group}`, severity: "error" });
    } else {
      const problem = typeof value === "string" ? checkTokenValue(token.kind, value) : `expects ${GRAMMAR[token.kind].expects}`;
      if (problem) issues.push({ path, message: problem, severity: "error" });
      else kept[key] = (value as string).trim();
    }
  }
  return kept;
}

/**
 * The valid part of a theme document and every problem in it. `doc` is null only when the input
 * is not a theme at all (not an object, or no usable name); otherwise each invalid field or value
 * is reported and left out.
 */
export function parseThemeDoc(input: unknown): { doc: ThemeDoc | null; issues: ThemeIssue[] } {
  if (!isPlainObject(input)) return { doc: null, issues: [{ path: [], message: "a theme is a JSON object", severity: "error" }] };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > THEME_LIMITS.nameMax) {
    return { doc: null, issues: [{ path: ["name"], message: `a name of 1–${THEME_LIMITS.nameMax} characters`, severity: "error" }] };
  }
  const issues: ThemeIssue[] = [];
  const doc: ThemeDoc = { name };
  for (const key of Object.keys(input)) {
    if (!["name", "base", "palette", ...THEME_GROUPS].includes(key)) {
      issues.push({ path: [key], message: "unknown field; a theme has name, base, palette, colors, layout and fonts", severity: "error" });
    }
  }
  if (input.base !== undefined) {
    if ((THEME_BASES as readonly unknown[]).includes(input.base)) doc.base = input.base as ThemeDoc["base"];
    else issues.push({ path: ["base"], message: 'is "light" or "dark"', severity: "error" });
  }
  if (input.palette !== undefined) {
    if (PALETTES.some((palette) => palette.id === input.palette)) doc.palette = input.palette as string;
    else issues.push({ path: ["palette"], message: `is one of ${PALETTES.map((palette) => palette.id).join(", ")}`, severity: "error" });
  }
  for (const group of THEME_GROUPS as readonly ThemeGroup[]) {
    if (input[group] === undefined) continue;
    const kept = parseGroup(group, input[group], issues);
    if (kept) doc[group] = kept;
  }
  // What survives the field checks can still be too large for the bridge.
  for (const message of checkThemeShape(doc)) issues.push({ path: [], message: message.replace(/^theme: /, ""), severity: "error" });
  return { doc, issues };
}

export function compileTheme(doc: ThemeDoc): CompiledTheme {
  const vars: Record<string, string> = {};
  for (const group of THEME_GROUPS as readonly ThemeGroup[]) {
    for (const [key, value] of Object.entries(doc[group] ?? {})) vars[`--osio-${key}`] = value;
  }
  return { ...(doc.base ? { base: doc.base } : {}), ...(doc.palette ? { palette: doc.palette } : {}), vars };
}
