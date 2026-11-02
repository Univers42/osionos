// The code theme from the app's resolved tokens (codeThemeFromTokens.ts), checked on every palette
// in light and dark as the browser would resolve them on the dock: body text reaches 4.5:1 on the
// terminal's background and every ANSI colour 3:1, and what comes out is what a page accepts.
import assert from "node:assert/strict";
import test from "node:test";

import { resolvedTokens } from "../../scripts/tokens/aliases.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { ANSI_KEYS, readCodeTheme } from "../../src/features/ide/model/codeTheme.ts";
import { codeThemeFromTokens } from "../../src/features/ide/model/codeThemeFromTokens.ts";
import { contrastRatio, ensureContrast, parseHexColor } from "../../src/shared/config/themeContrast.ts";
import { blocksOf, readAppFile } from "./tokens-css.ts";

const ratio = (a: string, b: string) => contrastRatio(parseHexColor(a)!, parseHexColor(b)!);

const sheet = (path: string, selector: RegExp) => Object.assign({}, ...blocksOf(readAppFile(path), selector).values()) as Record<string, string>;
const ROOT = { ...sheet("src/app/styles/global.css", /^:root$/), ...sheet("src/app/styles/appearance.css", /^:root$/) };
const DOCK = Object.fromEntries(Object.entries(ROOT).filter(([name]) => name.startsWith("--osio-code-"))) as Record<string, string>;

// Caveat: resolves only `var(--x)` and `var(--x, fallback)`, which is all the tokens read here use;
// a calc() or color-mix() comes back as written, as the browser's custom-property value would.
function reader(tokens: Record<string, string>) {
  const resolve = (value: string, depth = 0): string =>
    depth > 20 ? value : value.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) =>
      tokens[name] !== undefined ? resolve(tokens[name], depth + 1) : (fallback ?? "").trim());
  return (name: string) => resolve(tokens[name] ?? "").trim();
}

const dockTokens = (palette: unknown, mode: string) => ({ ...ROOT, ...resolvedTokens(palette, mode), ...DOCK });

test("the dock maps every code token it paints onto the palette, with no literal colour", () => {
  for (const name of ["--osio-code-bg", "--osio-code-fg", "--osio-code-border", "--osio-code-caret", "--osio-code-header-bg"]) {
    assert.match(DOCK[name] ?? "", /var\(--osio-/, name);
  }
  assert.ok(Object.values(DOCK).every((value) => !/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value)));
});

for (const palette of PALETTES as { id: string }[]) {
  for (const mode of MODES as string[]) {
    test(`${palette.id} ${mode}: readable on the terminal's background, and a theme a page accepts`, () => {
      const theme = codeThemeFromTokens(reader(dockTokens(palette, mode)));
      assert.ok(theme, "the tokens resolve to a theme");
      assert.equal(theme.kind, mode);
      const { bg } = theme.colors;
      assert.equal(bg, reader(dockTokens(palette, mode))("--osio-bg-surface").toUpperCase(), "the terminal paints the dock's surface");
      for (const key of ["fg", "fgMuted", "accentText", "danger"] as const) assert.ok(ratio(theme.colors[key], bg) >= 4.5, `${key} ${ratio(theme.colors[key], bg).toFixed(2)}`);
      assert.ok(ratio(theme.colors.onAccent, theme.colors.accent) >= 4.5, "text on the accent");
      for (const key of ["cursor", "focus", "warning", "success", "fgSubtle"] as const) assert.ok(ratio(theme.colors[key], bg) >= 3, key);
      for (const key of ANSI_KEYS) assert.ok(ratio(theme.ansi[key], bg) >= 3, `ansi ${key} ${ratio(theme.ansi[key], bg).toFixed(2)}`);
      assert.equal(new Set(ANSI_KEYS.slice(1, 7).map((key) => theme.ansi[key])).size, 6, "six distinct hues where the palette has them");
      assert.equal(theme.fonts.mono, reader(ROOT)("--osio-font-family-mono"), "the app's whole mono stack");
      assert.equal(theme.fonts.ui, reader(ROOT)("--osio-font-family-sans"), "the app's whole UI stack, -apple-system included");
      assert.deepEqual(readCodeTheme(theme), theme);
    });
  }
}

test("the default appearance gives the editor's 13px code, tight lines and the small radius", () => {
  const theme = codeThemeFromTokens(reader(dockTokens(PALETTES[0], "dark")))!;
  assert.deepEqual([theme.uiFontSize, theme.fontSize, theme.lineHeight, theme.radius], [14, 13, 1.25, 6]);
  const compact = codeThemeFromTokens(reader({ ...dockTokens(PALETTES[0], "dark"), "--osio-font-size-ui": "13px", "--osio-radius-scale": "0.5" }))!;
  assert.deepEqual([compact.uiFontSize, compact.fontSize, compact.radius], [13, 12, 3]);
});

// A seeded generator, not a property-testing library: none is in the manifest, and adding one
// for one test is a dependency the ladder does not allow.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

test("any palette, even an unreadable custom one, comes out readable", () => {
  const random = seeded(42);
  const hex = () => `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`;
  for (let run = 0; run < 400; run += 1) {
    const tokens: Record<string, string> = { ...dockTokens(PALETTES[0], run % 2 ? "dark" : "light") };
    for (const name of Object.keys(tokens)) if (/^#/.test(tokens[name])) tokens[name] = hex();
    const theme = codeThemeFromTokens(reader(tokens));
    assert.ok(theme, `run ${run}`);
    assert.ok(ratio(theme.colors.fg, theme.colors.bg) >= 4.5, `run ${run} fg`);
    for (const key of ANSI_KEYS) assert.ok(ratio(theme.ansi[key], theme.colors.bg) >= 3, `run ${run} ${key}`);
    assert.deepEqual(readCodeTheme(theme), theme, `run ${run}`);
  }
});

test("ensureContrast leaves a readable colour alone and moves an unreadable one to the nearest that reads", () => {
  assert.equal(ensureContrast("#FFFFFF", "#000000", 4.5), "#FFFFFF");
  const lifted = ensureContrast("#222222", "#111111", 3);
  assert.ok(ratio(lifted, "#111111") >= 3);
  assert.ok(ratio(lifted, "#111111") < 3.6, "no further than it must");
  assert.ok(ratio(ensureContrast("#777777", "#767676", 4.5), "#767676") >= 4.5, "the mid-grey worst case still reaches AA");
});

test("tokens that resolve to nothing give no theme rather than a guessed one", () => {
  assert.equal(codeThemeFromTokens(() => ""), null);
});
