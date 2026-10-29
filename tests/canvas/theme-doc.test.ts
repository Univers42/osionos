/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-doc.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A theme document as the editor and the store see it: every value is checked
// against its token's kind, a bad key costs that key and not the theme, and a
// valid theme compiles to the `--osio-*` properties written on <html>.

import assert from "node:assert/strict";
import test from "node:test";

import { checkTokenValue, compileTheme, parseThemeDoc } from "../../src/shared/config/themeDoc.ts";

const HARBOR_NIGHT = {
  name: "Harbor Night",
  base: "dark",
  palette: "nord",
  colors: { "bg-page": "#0f1520", "fg-default": "#dbe4ee", accent: "#5fb3b3" },
  layout: { radius: "10px", "page-max-width": "880px", "topbar-h": "44px" },
  fonts: { "font-ui": "\"Inter Variable\", system-ui, sans-serif", "font-size-ui": "15px" },
};

const issueAt = (issues: { path: string[] }[], path: string[]) =>
  issues.find((issue) => issue.path.join(".") === path.join("."));

test("the spec's example parses cleanly and compiles to --osio-* properties", () => {
  const { doc, issues } = parseThemeDoc(HARBOR_NIGHT);
  assert.deepEqual(issues, []);
  assert.ok(doc);
  const compiled = compileTheme(doc);
  assert.equal(compiled.vars["--osio-bg-page"], "#0f1520");
  assert.equal(compiled.vars["--osio-font-size-ui"], "15px");
  assert.equal(compiled.base, "dark");
  assert.equal(compiled.palette, "nord");
  assert.equal(Object.keys(compiled.vars).length, 8);
});

test("a token in the wrong group is an error that names the right group, and only it is dropped", () => {
  const { doc, issues } = parseThemeDoc({ ...HARBOR_NIGHT, layout: { "bg-page": "#000", radius: "4px" } });
  assert.match(issueAt(issues, ["layout", "bg-page"])?.message ?? "", /belongs in colors/);
  assert.equal(issueAt(issues, ["layout", "bg-page"])?.severity, "error");
  assert.deepEqual(doc?.layout, { radius: "4px" });
  assert.equal(doc?.colors?.["bg-page"], "#0f1520");
});

test("a token a later release removed is a warning, and the theme still loads", () => {
  const { doc, issues } = parseThemeDoc({ ...HARBOR_NIGHT, colors: { "removed-token": "#000", accent: "#5fb3b3" } });
  assert.equal(issueAt(issues, ["colors", "removed-token"])?.severity, "warning");
  assert.deepEqual(doc?.colors, { accent: "#5fb3b3" });
});

test("an unknown palette is an error and the palette is dropped", () => {
  const { doc, issues } = parseThemeDoc({ ...HARBOR_NIGHT, palette: "nope" });
  assert.equal(issueAt(issues, ["palette"])?.severity, "error");
  assert.equal(doc?.palette, undefined);
});

test("a value that fails its kind costs that value only", () => {
  const { doc, issues } = parseThemeDoc({ ...HARBOR_NIGHT, colors: { accent: "12px", "bg-page": "#0f1520" } });
  assert.equal(issueAt(issues, ["colors", "accent"])?.severity, "error");
  assert.deepEqual(doc?.colors, { "bg-page": "#0f1520" });
});

test("each kind accepts its CSS grammar and refuses the rest", () => {
  const cases: [Parameters<typeof checkTokenValue>[0], string[], string[]][] = [
    ["color", ["#abc", "#aabbccdd", "oklch(0.7 0.1 200)", "transparent", "rgb(1 2 3 / 50%)"], ["#ggg", "12px"]],
    ["length", ["12px", "0", "1.5rem", "calc(100% - 2rem)", "-0.02em", "clamp(10px, 1.6vw, 20px)"], ["12", "red"]],
    ["number", ["1.4", "600", "0.5"], ["1.4px"]],
    ["font", ["\"Inter\", sans-serif", "Georgia"], ["Inter;"]],
    ["duration", ["120ms", ".2s"], ["120"]],
    ["easing", ["cubic-bezier(.2,0,0,1)", "ease-out", "steps(4, end)"], ["bounce"]],
    ["shadow", ["0 1px 2px rgb(0 0 0 / 20%)", "none", "0 0 0 2px #000, 0 4px 8px rgba(0,0,0,.2)"], ["big"]],
  ];
  for (const [kind, accepted, refused] of cases) {
    for (const value of accepted) assert.equal(checkTokenValue(kind, value), null, `${kind} should accept ${value}`);
    for (const value of refused) assert.equal(typeof checkTokenValue(kind, value), "string", `${kind} should refuse ${value}`);
  }
});

test("a value that could break out of the declaration is refused whatever its kind", () => {
  for (const value of ["red; } body {", "url(x)", "var(--osio-accent)", "#000 !important"]) {
    assert.equal(typeof checkTokenValue("color", value), "string", value);
  }
});

test("a document that is not a theme gives no doc and says why", () => {
  for (const input of [null, [], "theme", { colors: {} }, { name: "" }]) {
    const { doc, issues } = parseThemeDoc(input);
    assert.equal(doc, null, JSON.stringify(input));
    assert.ok(issues.some((issue) => issue.severity === "error"), JSON.stringify(input));
  }
});

test("an unknown top-level field is an error at that field", () => {
  const { doc, issues } = parseThemeDoc({ ...HARBOR_NIGHT, extra: 1 });
  assert.equal(issueAt(issues, ["extra"])?.severity, "error");
  assert.ok(doc);
});
