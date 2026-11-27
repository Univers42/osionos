/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   palette-modes.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The top bar's prefix modes: which mode a query selects (with message search
// on and off), how a programmatic search stays literal, and what the ':' rows
// do to the real settings — applied once, a no-op on the current value, held
// on screen when storage is full, and refused while a theme pins them.

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { beforeEach } from "node:test";

import "./window-events.ts";

const AUTH_INDEX_STUB = `
export const useUserStore = {
  getState: () => ({ activeUserId: null, activeWorkspace: () => null, activeSession: () => null }),
  subscribe: () => () => undefined,
};
export const useIsAdmin = () => false;
`;
const CLIENT_STUB = `
export const API_BASE = "";
export class ApiError extends Error {}
export function getActivePageJwt() { return null; }
export function getActiveJwt() { return null; }
export const api = { get: async () => null, post: async () => null, patch: async () => null, delete: async () => null };
`;
const SETTINGS_NAV_STUB = `
export const calls = [];
export function openSettings(section = "profile", anchor) { calls.push({ section, anchor }); }
`;
const BY_SUFFIX: [string, string][] = [
  ["/src/shared/api/client.ts", CLIENT_STUB],
  ["/src/features/auth/index.ts", AUTH_INDEX_STUB],
  ["/src/features/auth/model/useUserStore.ts", AUTH_INDEX_STUB],
  ["/src/features/auth/model/userStore.helpers.ts", "export function pageApiJwtFromSessionToken(token) { return token; }"],
  ["/src/features/settings/model/settingsNav.ts", SETTINGS_NAV_STUB],
];
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    for (const [suffix, code] of BY_SUFFIX) if (resolved.url.endsWith(suffix)) return { url: url(code), shortCircuit: true };
    if (resolved.url.endsWith(".json")) return { ...resolved, importAttributes: { ...context.importAttributes, type: "json" }, shortCircuit: true };
    return resolved;
  },
});

const stored = new Map<string, string>();
const storage = {
  full: false,
  sets: 0,
  getItem: (key: string) => stored.get(key) ?? null,
  setItem(key: string, value: string) {
    if (storage.full) throw new DOMException("full", "QuotaExceededError");
    storage.sets += 1;
    stored.set(key, String(value));
  },
  removeItem: (key: string) => void stored.delete(key),
  clear: () => stored.clear(),
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size;
  },
};
const html = {
  dataset: {} as Record<string, string>,
  style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
};
Object.assign(globalThis, {
  window: globalThis,
  document: { documentElement: html },
  localStorage: storage,
  location: { search: "", hash: "" },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});
Reflect.set(globalThis, "__playgroundUserStore", { getState: () => ({ activeSession: () => null }), subscribe: () => () => undefined });

const { parsePaletteQuery, literalQuery, helpRows, askRows, visibleModes, PALETTE_MODES } =
  await import("../../src/widgets/top-bar/model/paletteModes.ts");
const { matchSettings } = await import("../../src/widgets/top-bar/model/settingRows.ts");
import type { InlineSetting } from "../../src/widgets/top-bar/model/settingRows.ts";
import type { PaletteCommand } from "../../src/widgets/top-bar/model/commands.ts";
const { inlineSettings } = await import("../../src/features/settings/model/inlineSettings.ts");
const theme = await import("../../src/shared/config/theme.ts");
const { useUIStore } = await import("../../src/shared/config/uiStore.ts");
const { usePalette } = await import("../../src/widgets/top-bar/model/usePalette.ts");
const nav = await import(url(SETTINGS_NAV_STUB));
const navCalls: unknown[] = Reflect.get(nav, "calls");

const ON = { messages: true };
const OFF = { messages: false };

const titles = (rows: { title: string }[]) => rows.map((row) => row.title);
function settingRows(query: string) {
  assert.ok(query.startsWith(":"), "a settings query starts with ':'");
  return matchSettings(query.slice(1), inlineSettings());
}
function run(query: string, title: string): void {
  const row = settingRows(query).find((candidate) => candidate.title === title);
  assert.ok(row, `no row "${title}" for "${query}"`);
  row.run();
}

beforeEach(() => {
  theme.setThemeOverrides(null);
  storage.full = false;
  navCalls.length = 0;
});

const FULL_WIDTH: Record<string, string> = { ">": "＞", ":": "：", "/": "／", "?": "？", "@": "＠", "#": "＃" };

for (const { prefix, mode } of PALETTE_MODES) {
  test(`parse '${prefix}': the prefix selects ${mode}, only as the first character`, () => {
    assert.deepEqual(parsePaletteQuery(prefix, ON), { mode, term: "" });
    assert.deepEqual(parsePaletteQuery(`${prefix} `, ON), { mode, term: " " });
    assert.deepEqual(parsePaletteQuery(`${prefix}${prefix}`, ON), { mode, term: prefix });
    assert.deepEqual(parsePaletteQuery(` ${prefix}x`, ON), { mode: "search", term: ` ${prefix}x` });
    assert.deepEqual(parsePaletteQuery(`${FULL_WIDTH[prefix]}x`, ON), { mode: "search", term: `${FULL_WIDTH[prefix]}x` });
  });
}

test("parse: no prefix and 'user:' are plain searches", () => {
  assert.deepEqual(parsePaletteQuery("", ON), { mode: "search", term: "" });
  assert.deepEqual(parsePaletteQuery("roadmap", ON), { mode: "search", term: "roadmap" });
  assert.deepEqual(parsePaletteQuery("user:ada", ON), { mode: "search", term: "user:ada" });
});

test("parse: '#' is a mode only while message search is on", () => {
  assert.deepEqual(parsePaletteQuery("#1 roadmap", ON), { mode: "messages", term: "1 roadmap" });
  assert.deepEqual(parsePaletteQuery("#1 roadmap", OFF), { mode: "search", term: "#1 roadmap" });
  assert.equal(visibleModes(OFF).some((info) => info.mode === "messages"), false);
  assert.equal(helpRows("", [], OFF).some((row) => row.id === "mode:messages"), false);
  assert.equal(helpRows("", [], ON).some((row) => row.id === "mode:messages"), true);
});

test("literal: a programmatic search of '#1 roadmap' searches that title, whatever the flag", () => {
  assert.equal(literalQuery("roadmap"), "roadmap");
  for (const scope of [ON, OFF]) {
    const parsed = parsePaletteQuery(literalQuery("#1 roadmap"), scope);
    assert.equal(parsed.mode, "search");
    assert.equal(parsed.term.trim(), "#1 roadmap");
  }
  usePalette.getState().openSearch("#1 roadmap");
  assert.equal(parsePaletteQuery(usePalette.getState().query, ON).mode, "search");
  usePalette.getState().openWith("?");
  assert.equal(usePalette.getState().query, "?");
  usePalette.getState().close();
});

test("help: mode rows narrow the bar; the Help menu's commands follow, without 'Show all commands'", () => {
  const commands: PaletteCommand[] = [
    { id: "help.commands", label: "Show all commands", group: "Help", run: () => undefined },
    { id: "help.docs", label: "Documentation", group: "Help", run: () => undefined },
    { id: "file.new", label: "New page", group: "File", run: () => undefined },
  ];
  const rows = helpRows("", commands, ON);
  assert.deepEqual(rows.map((row) => row.id), ["mode:command", "mode:setting", "mode:ask", "mode:people", "mode:messages", "help.docs"]);
  assert.equal(rows[0].refine, ">");
  assert.deepEqual(helpRows("doc", commands, ON).map((row) => row.id), ["help.docs"]);
});

test("ask: an empty term opens the assistant; a term is handed over trimmed, never sent", () => {
  const calls: string[] = [];
  const actions = { open: () => calls.push("open"), ask: (text: string) => calls.push(`ask:${text}`) };
  const [empty] = askRows("", actions);
  empty.run();
  const [term] = askRows("  what changed today ", actions);
  assert.equal(term.title, "Ask Binocle: “what changed today”");
  term.run();
  assert.deepEqual(calls, ["open", "ask:what changed today"]);
});

test("settings: a setting's name and a space lists exactly its options", () => {
  assert.deepEqual(titles(settingRows(":Theme ")), ["Theme: Light", "Theme: Dark", "Theme: System"]);
  assert.deepEqual(titles(settingRows(":theme d")), ["Theme: Dark"]);
  assert.deepEqual(titles(settingRows(":Caret shape ")), ["Caret shape: Thin", "Caret shape: Thick", "Caret shape: Block", "Caret shape: Underline"]);
});

test("settings: keyword matches show only when no name matches", () => {
  const named = settingRows(":dark");
  assert.ok(named.length > 0);
  for (const row of named) assert.match(row.title.toLowerCase(), /dark/);
  const byKeyword = titles(settingRows(":cursor"));
  assert.ok(byKeyword.includes("Caret shape: Block"), byKeyword.join(", "));
});

test("settings: current() and blocked() are read once per setting per match", () => {
  let reads = 0;
  let blocks = 0;
  const setting: InlineSetting = {
    id: "x", label: "Thing",
    options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }],
    current: () => { reads += 1; return "a"; },
    blocked: () => { blocks += 1; return null; },
    apply: () => undefined,
  };
  matchSettings("thing", [setting]);
  matchSettings("Thing ", [setting]);
  matchSettings("", [setting]);
  assert.deepEqual([reads, blocks], [3, 3]);
});

test("settings: choosing a theme applies it; choosing the current one writes nothing", () => {
  run(":Theme ", "Theme: Dark");
  assert.equal(theme.readCurrentThemeMode(), "dark");
  assert.equal(html.dataset.theme, "dark");
  const current = settingRows(":Theme ").find((row) => row.title === "Theme: Dark");
  assert.equal(current?.subtitle, "Current");
  const sets = storage.sets;
  let notified = 0;
  const unsubscribe = theme.subscribeThemeChoice(() => { notified += 1; });
  current?.run();
  unsubscribe();
  assert.deepEqual([storage.sets - sets, notified], [0, 0]);
});

test("settings: a choice storage refuses still reads as current", () => {
  run(":Theme ", "Theme: Dark");
  storage.full = true;
  run(":Theme ", "Theme: Light");
  assert.equal(theme.readCurrentThemeMode(), "light");
  assert.equal(settingRows(":").find((row) => row.title === "Theme")?.subtitle, "Light");
});

test("settings: a theme that pins the mode blocks the row and opens Appearance instead", () => {
  run(":Theme ", "Theme: Light");
  theme.setThemeOverrides({ base: "dark" });
  const rows = settingRows(":Theme ");
  assert.ok(rows.every((row) => row.subtitle === "Set by your theme"));
  rows.find((row) => row.title === "Theme: Dark")?.run();
  assert.equal(theme.readCurrentThemeMode(), "light");
  assert.deepEqual(navCalls, [{ section: "preferences", anchor: "appearance" }]);
});

test("settings: the accent is blocked under a fixed-accent palette, chosen or pinned by a theme", () => {
  run(":Color scheme ", "Color scheme: Nord");
  assert.notEqual(settingRows(":Accent ")[0].subtitle, "Your color scheme sets the accent");
  run(":Color scheme ", "Color scheme: High Contrast");
  assert.ok(settingRows(":Accent ").every((row) => row.subtitle === "Your color scheme sets the accent"));
  run(":Color scheme ", "Color scheme: Nord");
  theme.setThemeOverrides({ palette: "contrast" });
  assert.ok(settingRows(":Accent ").every((row) => row.subtitle === "Your color scheme sets the accent"));
});

test("settings: side bar and title bar change from the bar, and choosing the current value again keeps them", () => {
  run(":Side bar ", "Side bar: Right");
  assert.equal(useUIStore.getState().sidebarSide, "right");
  run(":Title bar ", "Title bar: Auto-hide");
  run(":Title bar ", "Title bar: Auto-hide");
  assert.equal(useUIStore.getState().topBarAutoHide, true);
  run(":Side bar ", "Side bar: Left");
  run(":Title bar ", "Title bar: Always shown");
  assert.deepEqual([useUIStore.getState().sidebarSide, useUIStore.getState().topBarAutoHide], ["left", false]);
});
