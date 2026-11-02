// The app's resolved `--osio-*` tokens as the code theme the terminal and IDE pages paint with
// (codeTheme.ts). The pure half: `read` returns what getComputedStyle resolved on the host
// (codeThemeHost.ts), so every palette, light or dark, accent and custom theme flows through. Every
// colour is a token or derived from one; none is a literal. Text colours are moved, only as far as
// they must, until they read on the background: 4.5:1 for text, 3:1 for the ANSI colours, the
// cursor and the focus ring (themeContrast.ts ensureContrast), so even an unreadable custom theme
// gives a readable terminal.
import { ensureContrast } from "@/shared/config/themeContrast";

import { composite, normalizeColor, relativeLuminance, withAlpha } from "../ui/editorPalette";
import { readCodeTheme, readFontFamilies, SYNTAX_KEYS, type AnsiKey, type CodeTheme, type SyntaxKey } from "./codeTheme";

const MONO_DEFAULT = '"JetBrains Mono", ui-monospace, monospace';
const UI_DEFAULT = '"Inter Variable", system-ui, sans-serif';
const UI_FONT_SIZE_DEFAULT = 14;
const LINE_HEIGHT_DEFAULT = 1.25;
const RADIUS_DEFAULT = 6;

const TEXT = 4.5;
const GRAPHIC = 3;

/** `a` moved `t` (0-1) of the way to `b`, both opaque. */
const mix = (a: string, b: string, t: number) => composite(withAlpha(a, 1 - t), b);

// Caveat: a length is read in the two shapes the tokens are written in, `Npx` and
// `calc(Npx * K)` (the radius scale, global.css); any other expression gives null and the
// caller's default, so a theme that writes its radius another way keeps the default corners.
function px(raw: string): number | null {
  const plain = /^([\d.]+)px$/.exec(raw);
  if (plain) return Number(plain[1]);
  const scaled = /^calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)$/.exec(raw);
  return scaled ? Number(scaled[1]) * Number(scaled[2]) : null;
}

type Palette = { bg: string; fg: string; strong: string; muted: string; subtle: string; raised: string };

function ansiColors(kind: CodeTheme["kind"], p: Palette, tint: (name: string) => string): Record<AnsiKey, string> {
  const hues = { red: tint("red"), green: tint("green"), yellow: tint("yellow"), blue: tint("blue"), magenta: tint("purple") };
  // Caveat: the palette has no cyan tint, so cyan is blue and green half-mixed. Where those two
  // tints sit close in hue (the grey Monochrome palette), cyan is hard to tell from either.
  const cyan = mix(hues.blue, hues.green, 0.5);
  const base = { ...hues, cyan };
  const greys = kind === "dark"
    ? { black: p.raised, white: p.muted, brightBlack: p.subtle, brightWhite: p.strong }
    : { black: p.strong, white: p.subtle, brightBlack: p.muted, brightWhite: mix(p.subtle, p.bg, 0.3) };
  const bright = (color: string) => mix(color, p.strong, 0.25);
  const ansi: Record<AnsiKey, string> = {
    ...greys, ...base,
    brightRed: bright(base.red), brightGreen: bright(base.green), brightYellow: bright(base.yellow),
    brightBlue: bright(base.blue), brightMagenta: bright(base.magenta), brightCyan: bright(base.cyan),
  };
  for (const key of Object.keys(ansi) as AnsiKey[]) ansi[key] = ensureContrast(ansi[key], p.bg, GRAPHIC);
  return ansi;
}

/** The code theme `read` resolves to, or null when neither a background nor a text colour does. */
export function codeThemeFromTokens(read: (name: string) => string): CodeTheme | null {
  const token = (...names: string[]) => names.map((name) => normalizeColor(read(name))).find((color) => color !== null) ?? null;
  const bgToken = token("--osio-code-bg", "--osio-bg-surface");
  const fgToken = token("--osio-code-fg", "--osio-fg-default");
  if (!bgToken || !fgToken) return null;
  const bg = bgToken.length === 9 ? composite(bgToken, token("--osio-bg-canvas")?.slice(0, 7) ?? fgToken.slice(0, 7)) : bgToken;
  const flat = (color: string, over = bg) => (color.length === 9 ? composite(color, over) : color);
  const or = (fallback: string, ...names: string[]) => flat(token(...names) ?? fallback);
  const readable = (color: string, ratio: number, over = bg) => ensureContrast(color, over, ratio);

  const fg = readable(flat(fgToken), TEXT);
  const kind = relativeLuminance(bg) < relativeLuminance(fg) ? "dark" : "light";
  const accent = or(fg, "--osio-accent");
  const fgSubtle = readable(or(mix(fg, bg, 0.5), "--osio-fg-subtle"), GRAPHIC);
  const p: Palette = {
    bg, fg, subtle: fgSubtle,
    strong: or(fg, "--osio-fg-strong"),
    muted: readable(or(mix(fg, bg, 0.35), "--osio-fg-muted"), TEXT),
    raised: or(mix(bg, fg, 0.06), "--osio-bg-elevated"),
  };
  const syntax = {} as Record<SyntaxKey, string>;
  for (const key of SYNTAX_KEYS) syntax[key] = readable(or(fg, `--osio-syntax-${key}`), TEXT);
  const uiFontSize = px(read("--osio-font-size-ui")) ?? UI_FONT_SIZE_DEFAULT;

  return readCodeTheme({
    kind,
    colors: {
      bg, fg, fgMuted: p.muted, fgSubtle, raised: p.raised,
      hover: or(mix(bg, fg, 0.08), "--osio-bg-hover"),
      selected: or(mix(bg, accent, 0.2), "--osio-accent-subtle"),
      border: or(mix(bg, fg, 0.15), "--osio-code-border", "--osio-border"),
      accent,
      accentHover: or(accent, "--osio-accent-hover"),
      onAccent: readable(flat(token("--osio-accent-fg") ?? bg, accent), TEXT, accent),
      accentText: readable(or(accent, "--osio-accent-text"), TEXT),
      focus: readable(or(accent, "--osio-focus-ring-color"), GRAPHIC),
      danger: readable(or(accent, "--osio-danger"), TEXT),
      warning: readable(or(accent, "--osio-warning"), GRAPHIC),
      success: readable(or(accent, "--osio-success"), GRAPHIC),
      cursor: readable(or(accent, "--osio-code-caret", "--osio-caret"), GRAPHIC),
      selection: withAlpha(accent, 0.3),
      scrollbar: withAlpha(fgSubtle, 0.4),
    },
    ansi: ansiColors(kind, p, (name) => or(fg, `--osio-block-tint-${name}-fg`)),
    syntax,
    fonts: {
      mono: readFontFamilies(read("--osio-font-family-mono")) ?? MONO_DEFAULT,
      ui: readFontFamilies(read("--osio-font-family-sans")) ?? UI_DEFAULT,
    },
    uiFontSize,
    fontSize: uiFontSize - 1,
    lineHeight: Number(read("--osio-line-height-tight")) || LINE_HEIGHT_DEFAULT,
    radius: Math.round(px(read("--osio-radius-sm")) ?? RADIUS_DEFAULT),
  });
}
