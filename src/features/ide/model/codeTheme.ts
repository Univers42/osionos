// The code theme every VS Code surface osionos draws shares: its own Monaco, the terminal page
// and the IDE page. Free of `@/` imports: the two pages are built without the app's aliases.
//
// A theme crosses from the app into a page on another origin and lands in VS Code's settings and
// the page's style, so readCodeTheme is the page's only way to take one: hex colours, plain font
// family names and bounded numbers, each required, and any wrong field refuses the whole theme.
// It copies only the fields it knows, so nothing else a message carries reaches the page.

export const SYNTAX_KEYS = ["keyword", "string", "comment", "function", "number", "literal", "property", "type", "tag", "attr"] as const;
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];

export const CODE_COLOR_KEYS = [
  "bg", "raised", "hover", "selected", "fg", "fgMuted", "fgSubtle", "border", "accent", "accentHover", "onAccent", "accentText",
  "focus", "danger", "warning", "success", "cursor", "selection", "scrollbar",
] as const;
export type CodeColorKey = (typeof CODE_COLOR_KEYS)[number];

export const ANSI_KEYS = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;
export type AnsiKey = (typeof ANSI_KEYS)[number];

export interface CodeTheme {
  kind: "light" | "dark";
  colors: Record<CodeColorKey, string>;
  ansi: Record<AnsiKey, string>;
  syntax: Record<SyntaxKey, string>;
  fonts: { mono: string; ui: string };
  /** Code text (terminal, editor), px. */
  fontSize: number;
  /** The app's UI text, px. */
  uiFontSize: number;
  /** The terminal's line height, a multiple of the font size. */
  lineHeight: number;
  /** The small corner radius of tabs, inputs and buttons, px. */
  radius: number;
}

export const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// A family is a quoted or bare name of letters, digits, spaces and hyphens: no quote inside a
// quote, no parenthesis (url(), var()), no semicolon or brace that could end a declaration.
const FAMILY = /^(?:"[A-Za-z0-9][A-Za-z0-9 -]{0,63}"|-?[A-Za-z][A-Za-z0-9-]{0,63})$/;
const MAX_FAMILIES = 16;

const NUMBER_BOUNDS = { fontSize: [8, 32], uiFontSize: [10, 24], lineHeight: [1, 3], radius: [0, 24] } as const;

/** `value` as a list of plain font family names, normalized to ", " separators; null otherwise. */
export function readFontFamilies(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  const families = value.split(",").map((family) => family.trim());
  if (families.length > MAX_FAMILIES || !families.every((family) => FAMILY.test(family))) return null;
  return families.join(", ");
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function readHexSet<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | null {
  const source = record(value);
  if (!source) return null;
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const color = source[key];
    if (typeof color !== "string" || !HEX_COLOR.test(color)) return null;
    out[key] = color;
  }
  return out;
}

function readNumbers(source: Record<string, unknown>): Pick<CodeTheme, keyof typeof NUMBER_BOUNDS> | null {
  const out = {} as Record<keyof typeof NUMBER_BOUNDS, number>;
  for (const [key, [min, max]] of Object.entries(NUMBER_BOUNDS) as [keyof typeof NUMBER_BOUNDS, readonly [number, number]][]) {
    const n = source[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) return null;
    out[key] = n;
  }
  return out;
}

/** The theme in `value`, field by field, or null when any field is missing or not what it must be. */
export function readCodeTheme(value: unknown): CodeTheme | null {
  const source = record(value);
  if (!source || (source.kind !== "light" && source.kind !== "dark")) return null;
  const colors = readHexSet(source.colors, CODE_COLOR_KEYS);
  const ansi = readHexSet(source.ansi, ANSI_KEYS);
  const syntax = readHexSet(source.syntax, SYNTAX_KEYS);
  const fonts = record(source.fonts);
  const mono = readFontFamilies(fonts?.mono);
  const ui = readFontFamilies(fonts?.ui);
  const numbers = readNumbers(source);
  if (!colors || !ansi || !syntax || !mono || !ui || !numbers) return null;
  return { kind: source.kind, colors, ansi, syntax, fonts: { mono, ui }, ...numbers };
}
