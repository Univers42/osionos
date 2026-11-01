// The code theme the terminal and IDE pages paint with (codeTheme.ts): what crosses into a page
// is validated field by field, hex colours only, font lists by a strict grammar, numbers bounded,
// and the whole theme is refused when one field is wrong.
import assert from "node:assert/strict";
import test from "node:test";

import { ANSI_KEYS, CODE_COLOR_KEYS, readCodeTheme, readFontFamilies, type CodeTheme } from "../../src/features/ide/model/codeTheme.ts";
import { codeThemeSettings, legacyTerminalSettings } from "../../src/features/ide/model/codeThemeSettings.ts";
import { SYNTAX_KEYS } from "../../src/features/ide/model/codeTheme.ts";

const sample = (): CodeTheme => ({
  kind: "dark",
  colors: Object.fromEntries(CODE_COLOR_KEYS.map((key, i) => [key, `#${(0x202020 + i * 0x070707).toString(16).toUpperCase()}`])) as CodeTheme["colors"],
  ansi: Object.fromEntries(ANSI_KEYS.map((key, i) => [key, `#${(0x808080 + i * 0x030303).toString(16).toUpperCase()}`])) as CodeTheme["ansi"],
  syntax: Object.fromEntries(SYNTAX_KEYS.map((key) => [key, "#C3AEE6"])) as CodeTheme["syntax"],
  fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', ui: '"Inter Variable", system-ui, sans-serif' },
  fontSize: 13,
  uiFontSize: 14,
  lineHeight: 1.25,
  radius: 6,
});

const withField = (path: string[], value: unknown) => {
  const theme = structuredClone(sample()) as unknown as Record<string, unknown>;
  let at = theme;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
  at[path.at(-1) as string] = value;
  return theme;
};

test("a well-formed theme reads back as itself; a field it does not know is dropped", () => {
  assert.deepEqual(readCodeTheme(sample()), sample());
  assert.deepEqual(readCodeTheme({ ...sample(), script: "alert(1)" }), sample());
  assert.equal(readCodeTheme({ ...sample(), selection: "#33669980" } as never)?.colors.selection, sample().colors.selection);
});

test("a colour that is not hex refuses the whole theme", () => {
  for (const bad of ["red", "rgb(0, 0, 0)", "#12345", "#fff;}", "#GGGGGG", "var(--osio-accent)", "", 0, null]) {
    assert.equal(readCodeTheme(withField(["colors", "bg"], bad)), null, `colors.bg = ${String(bad)}`);
    assert.equal(readCodeTheme(withField(["ansi", "red"], bad)), null, `ansi.red = ${String(bad)}`);
    assert.equal(readCodeTheme(withField(["syntax", "keyword"], bad)), null, `syntax.keyword = ${String(bad)}`);
  }
  const missing = structuredClone(sample()) as unknown as { ansi: Record<string, string> };
  delete missing.ansi.brightWhite;
  assert.equal(readCodeTheme(missing), null);
  assert.equal(readCodeTheme(withField(["kind"], "auto")), null);
});

test("a font list passes only as plain family names", () => {
  assert.equal(readFontFamilies('"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", monospace'), '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", monospace');
  assert.equal(readFontFamilies("  Inter ,  sans-serif "), "Inter, sans-serif");
  const tooMany = Array.from({ length: 17 }, (_, i) => `Font${i}`).join(", ");
  for (const bad of ['x; background: url(https://evil.example)', 'url(x)', '"a\\"b"', "var(--osio-font-ui)", '"a", ', "", tooMany, "a{b}", "'single'", 42]) {
    assert.equal(readFontFamilies(bad), null, String(bad));
    assert.equal(readCodeTheme(withField(["fonts", "mono"], bad)), null, `fonts.mono = ${String(bad)}`);
  }
});

test("numbers are finite and bounded", () => {
  for (const [field, bad] of [["fontSize", 100], ["fontSize", 5], ["fontSize", Number.NaN], ["fontSize", "13"], ["uiFontSize", 40], ["lineHeight", 0], ["lineHeight", 4], ["radius", -1], ["radius", 99]] as const) {
    assert.equal(readCodeTheme(withField([field], bad)), null, `${field} = ${String(bad)}`);
  }
  for (const junk of [null, undefined, "theme", 1, [], [sample()]]) assert.equal(readCodeTheme(junk), null);
});

test("the settings paint every part of VS Code the pages show, in the theme's colours and fonts", () => {
  const theme = sample();
  const settings = codeThemeSettings(theme);
  const colors = settings["workbench.colorCustomizations"] as Record<string, string>;
  assert.equal(settings["workbench.colorTheme"], "Default Dark Modern");
  assert.equal(codeThemeSettings({ ...theme, kind: "light" })["workbench.colorTheme"], "Default Light Modern");
  for (const key of [
    "panel.background", "panelTitle.activeForeground", "tab.activeBackground", "terminal.tab.activeBorder", "terminal.background",
    "terminal.foreground", "terminalCursor.foreground", "terminal.selectionBackground", "focusBorder", "scrollbarSlider.background",
    "toolbar.hoverBackground", "list.activeSelectionBackground", "input.background", "button.background", "button.foreground",
    "dropdown.background", "menu.background", "quickInput.background", "widget.border", "editor.background", "editor.foreground",
    "sideBar.background", "activityBar.background", "statusBar.background", "titleBar.activeBackground",
  ]) assert.match(colors[key] ?? "", /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/i, key);
  assert.equal(colors["terminal.background"], theme.colors.bg);
  assert.equal(colors["editor.background"], theme.colors.bg);
  assert.equal(colors["button.background"], theme.colors.accent);
  assert.equal(colors["button.foreground"], theme.colors.onAccent);
  for (const key of ANSI_KEYS) assert.equal(colors[`terminal.ansi${key[0].toUpperCase()}${key.slice(1)}`], theme.ansi[key], key);
  assert.equal(settings["terminal.integrated.fontFamily"], theme.fonts.mono);
  assert.equal(settings["terminal.integrated.fontSize"], theme.fontSize);
  assert.equal(settings["terminal.integrated.lineHeight"], theme.lineHeight);
  assert.equal(settings["editor.fontFamily"], theme.fonts.mono);
  assert.equal(settings["editor.fontSize"], theme.fontSize);
  assert.ok(["block", "line", "underline"].includes(settings["terminal.integrated.cursorStyle"] as string));
  const rules = (settings["editor.tokenColorCustomizations"] as { textMateRules: { settings: { foreground?: string } }[] }).textMateRules;
  assert.ok(rules.length >= SYNTAX_KEYS.length);
  assert.ok(rules.every((rule) => !rule.settings.foreground || /^#[0-9A-F]{6}$/i.test(rule.settings.foreground)));
});

test("without a theme (an app older than the page) the page keeps today's four colours", () => {
  const dark = legacyTerminalSettings({ background: "#0d1117", foreground: "#e6edf3", cursor: "#58a6ff", selection: "#388bfd59" });
  assert.equal(dark["workbench.colorTheme"], "Default Dark Modern");
  assert.deepEqual(dark["workbench.colorCustomizations"], {
    "terminal.background": "#0d1117", "panel.background": "#0d1117", "terminal.foreground": "#e6edf3",
    "terminalCursor.foreground": "#58a6ff", "terminal.selectionBackground": "#388bfd59",
  });
  assert.equal(legacyTerminalSettings({ background: "#fbfcfd" })["workbench.colorTheme"], "Default Light Modern");
  assert.deepEqual(legacyTerminalSettings({})["workbench.colorCustomizations"], {});
});
