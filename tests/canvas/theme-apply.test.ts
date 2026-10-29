/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-apply.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// How a theme reaches <html>: a second theme writes only the properties that
// changed, a theme that pins light or dark wins over the mode preference, the
// first-paint cache is filtered like index.html filters it, and the library
// keeps names unique. Runs on a stub <html> that records every style write.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const stored = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, String(value)),
  removeItem: (key: string) => void stored.delete(key),
  clear: () => stored.clear(),
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size;
  },
};
const writes: string[] = [];
const props = new Map<string, string>();
const html = {
  dataset: {} as Record<string, string>,
  style: {
    setProperty: (name: string, value: string) => {
      writes.push(`set ${name}`);
      props.set(name, value);
    },
    removeProperty: (name: string) => {
      writes.push(`remove ${name}`);
      props.delete(name);
    },
    getPropertyValue: (name: string) => props.get(name) ?? "",
  },
};
const locationStub = { search: "", hash: "" };
Object.assign(globalThis, {
  window: globalThis,
  document: { documentElement: html },
  localStorage: localStorageStub,
  location: locationStub,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});

const { applyTheme, setThemeOverrides, toggleThemeMode, isThemeBasePinned } = await import("../../src/shared/config/theme.ts");
const { THEME_VARS_KEY, applyCompiledTheme, applyStoredTheme, isThemeSafeMode, persistCompiledTheme, readCompiledTheme } =
  await import("../../src/shared/config/themeApply.ts");
const { listThemes, resolveTheme, useThemeLibrary } = await import("../../src/features/theme/model/useThemeLibrary.ts");

beforeEach(() => {
  applyCompiledTheme(null);
  useThemeLibrary.setState({ themes: {}, activeTheme: null });
  stored.clear();
  writes.length = 0;
  locationStub.search = "";
});

test("a second theme sets what changed, removes what it dropped, and touches nothing else", () => {
  applyCompiledTheme({ vars: { "--osio-bg-page": "#111111", "--osio-fg-default": "#eeeeee" } });
  writes.length = 0;
  applyCompiledTheme({ vars: { "--osio-bg-page": "#222222" } });
  assert.deepEqual(writes.sort(), ["remove --osio-fg-default", "set --osio-bg-page"]);
  writes.length = 0;
  applyCompiledTheme({ vars: { "--osio-bg-page": "#222222" } });
  assert.deepEqual(writes, []);
});

test("a pinned base wins over the stored mode, and the quick toggle leaves it in place", () => {
  stored.set("osionos:theme-mode", "light");
  setThemeOverrides({ base: "dark" });
  assert.equal(html.dataset.theme, "dark");
  assert.equal(isThemeBasePinned(), true);
  applyTheme("system");
  assert.equal(html.dataset.theme, "dark");
  assert.equal(toggleThemeMode(), "light");
  assert.equal(html.dataset.theme, "dark");
  assert.equal(stored.get("osionos:theme-mode"), "light");
  setThemeOverrides(null);
  assert.equal(html.dataset.theme, "light");
  assert.equal(isThemeBasePinned(), false);
});

test("a pinned palette wins over the palette preference until the theme goes", () => {
  stored.set("osionos:palette", "rose");
  setThemeOverrides({ palette: "nord" });
  assert.equal(html.dataset.palette, "nord");
  setThemeOverrides(null);
  assert.equal(html.dataset.palette, "rose");
});

test("a tampered first-paint cache keeps only what the app itself could write", () => {
  stored.set(THEME_VARS_KEY, JSON.stringify({
    v: 1,
    base: "dark",
    palette: "nope",
    vars: { "--osio-bg-page": "#101010", "--x": "red", "--osio-fg-default": "red;}", "--osio-link": "url(x)" },
  }));
  assert.deepEqual(readCompiledTheme(), { base: "dark", vars: { "--osio-bg-page": "#101010" } });
  stored.set(THEME_VARS_KEY, "{not json");
  assert.equal(readCompiledTheme(), null);
  stored.set(THEME_VARS_KEY, JSON.stringify({ v: 2, vars: {} }));
  assert.equal(readCompiledTheme(), null);
});

test("?theme=safe and the kill switch leave the stored theme off; otherwise it applies", () => {
  persistCompiledTheme({ base: "dark", vars: { "--osio-bg-page": "#101010" } });
  locationStub.search = "?theme=safe";
  assert.equal(isThemeSafeMode(), true);
  applyStoredTheme();
  assert.equal(props.get("--osio-bg-page"), undefined);
  locationStub.search = "?osio.themes=0";
  assert.equal(isThemeSafeMode(), false);
  applyStoredTheme();
  assert.equal(props.get("--osio-bg-page"), undefined);
  locationStub.search = "";
  applyStoredTheme();
  assert.equal(props.get("--osio-bg-page"), "#101010");
  assert.equal(html.dataset.theme, "dark");
});

test("the boot pass removes what the first-paint script wrote when the theme is switched off", () => {
  persistCompiledTheme({ vars: { "--osio-bg-page": "#101010" } });
  props.set("--osio-bg-page", "#101010");
  locationStub.search = "?osio.themes=0";
  applyStoredTheme();
  assert.equal(props.get("--osio-bg-page"), undefined);
});

test("saveTheme refuses a shipped name, a duplicate name and an invalid theme, and a rename moves the key", () => {
  const save = (...args: Parameters<ReturnType<typeof useThemeLibrary.getState>["saveTheme"]>) => useThemeLibrary.getState().saveTheme(...args);
  assert.equal(save({ name: "Meadow" }).ok, false);
  assert.deepEqual(save({ name: "Night Shift", base: "dark" }), { ok: true });
  const duplicate = save({ name: "night shift" });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.ok ? "" : duplicate.message, /already/);
  assert.equal(save({ name: "Broken", colors: { accent: "12px" } }).ok, false);
  assert.equal(save({ name: "!!!" }).ok, false);
  assert.deepEqual(save({ name: "Night Watch", base: "dark" }, "Night Shift"), { ok: true });
  assert.deepEqual(Object.keys(useThemeLibrary.getState().themes), ["night-watch"]);
  assert.deepEqual(save({ name: "Night Watch", base: "light" }, "Night Watch"), { ok: true });
  assert.equal(resolveTheme("night watch")?.base, "light");
});

test("the library holds at most the bridge's limit of themes", () => {
  for (let index = 0; index < 24; index += 1) assert.equal(useThemeLibrary.getState().saveTheme({ name: `Theme ${index}` }).ok, true);
  assert.equal(useThemeLibrary.getState().saveTheme({ name: "One too many" }).ok, false);
});

test("setActiveTheme applies the theme and caches it for the next first paint", () => {
  useThemeLibrary.getState().setActiveTheme("Meadow");
  assert.equal(props.get("--osio-bg-page"), "#f4f8f1");
  assert.equal(html.dataset.theme, "light");
  assert.equal(readCompiledTheme()?.vars["--osio-bg-page"], "#f4f8f1");
  assert.equal(useThemeLibrary.getState().activeTheme, "Meadow");
  useThemeLibrary.getState().setActiveTheme(null);
  assert.equal(props.get("--osio-bg-page"), undefined);
  assert.equal(stored.get(THEME_VARS_KEY), undefined);
});

test("saving or renaming the active theme re-applies it under its new name", () => {
  const library = () => useThemeLibrary.getState();
  library().saveTheme({ name: "Night Shift", colors: { "bg-page": "#101010" } });
  library().setActiveTheme("Night Shift");
  library().saveTheme({ name: "Night Watch", colors: { "bg-page": "#202020" } }, "Night Shift");
  assert.equal(library().activeTheme, "Night Watch");
  assert.equal(props.get("--osio-bg-page"), "#202020");
  assert.equal(readCompiledTheme()?.vars["--osio-bg-page"], "#202020");
});

test("listThemes puts the shipped themes first, and deleteTheme hands back the doc for Undo", () => {
  const library = () => useThemeLibrary.getState();
  library().saveTheme({ name: "Zebra" });
  library().saveTheme({ name: "Aurora" });
  library().setActiveTheme("Aurora");
  assert.deepEqual(listThemes().map((theme) => theme.name).slice(-2), ["Aurora", "Zebra"]);
  assert.equal(listThemes()[0].name, "Harbor Night");
  assert.deepEqual(library().deleteTheme("aurora"), { name: "Aurora" });
  assert.equal(library().activeTheme, null);
  assert.equal(library().deleteTheme("Meadow"), null);
  assert.equal(resolveTheme("Aurora"), null);
});
