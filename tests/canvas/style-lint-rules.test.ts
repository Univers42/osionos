/* ************************************************************************** */
/*  style-lint-rules.test.ts — the style-literal guards in eslint.config.js   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });

const COMPONENT = "src/features/demo/ui/Demo.tsx";
const KIT_COMPONENT = "packages/osionos-ui/src/atoms/Demo.tsx";
const BRAND_CATALOG = "src/features/settings/mcp/mcpCatalog.tsx";

/** Messages of the guard rule only: the other rules have opinions about snippets. */
async function guardMessages(code: string, filePath = COMPONENT): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

const BAD: Array<[string, string, RegExp]> = [
  ["a px font size", 'export const c = "flex text-[11px] gap-1";', /text-2xs/],
  ["a px font size behind a variant", 'export const c = "md:text-[13px]";', /text-sm/],
  ["shadow-sm", 'export const c = "shadow-sm";', /shadow-osio-e1/],
  ["shadow-md behind a variant", 'export const c = "p-2 hover:shadow-md";', /shadow-osio-e/],
  ["shadow-2xl", 'export const c = "shadow-2xl";', /shadow-osio-e/],
  ["a stock shadow with an opacity modifier", 'export const c = "shadow-md/20";', /shadow-osio-e/],
  ["a bare shadow token", 'export const c = "flex shadow rounded-md";', /shadow-osio-e1/],
  ["a bare rounded token", 'export const c = "flex rounded border";', /rounded-xs/],
  ["a className that is exactly rounded", 'export const C = () => <div className="rounded" />;', /rounded-xs/],
  ["a className that is exactly shadow", 'export const C = () => <div className="shadow" />;', /shadow-osio-e1/],
  ["a bare rounded behind a variant", 'export const c = "group-hover:rounded";', /rounded-xs/],
  ["a template literal with a px font size", "export const c = (x: string) => `${x} text-[10px]`;", /text-3xs/],
  ["a template literal with a stock shadow", "export const c = (x: string) => `shadow-lg ${x}`;", /shadow-osio-e/],
  ["a template literal with a bare rounded", "export const c = (x: string) => `${x} rounded`;", /rounded-xs/],
  ["a 6-digit hex", 'export const c = "#1f2937";', /hex/i],
  ["a 3-digit hex", 'export const c = "#fff";', /hex/i],
  ["an 8-digit hex", 'export const c = "#ffffffcf";', /hex/i],
  ["a hex inside an arbitrary class", 'export const c = "bg-[#ff5f57]";', /hex/i],
  ["a hex fallback inside var()", 'export const c = "var(--osio-danger, #ff6b6b)";', /hex/i],
  ["a ramp neutral", 'export const c = "bg-[var(--osio-n-3)]";', /semantic/],
  ["a ramp accent", 'export const c = "text-[var(--osio-a-solid)]";', /semantic/],
];

for (const [name, code, message] of BAD) {
  test(`fires on ${name}`, async () => {
    const messages = await guardMessages(code);
    assert.ok(messages.some((text) => message.test(text)), `no message matching ${message} in ${JSON.stringify(messages)}`);
  });
}

const GOOD: Array<[string, string]> = [
  ["the type-scale keys", 'export const c = "text-3xs text-2xs text-xs text-sm text-display";'],
  ["radius keys", 'export const c = "rounded-xs rounded-md rounded-xl rounded-full rounded-t-md";'],
  ["elevation keys", 'export const c = "shadow-osio-e1 shadow-osio-e3 hover:shadow-osio-e2 shadow-none";'],
  ["names that merely contain shadow", 'export const c = "drop-shadow-md transition-shadow"; export const p = "box-shadow";'],
  ["a token-valued arbitrary class", 'export const c = "rounded-[var(--osio-radius)] text-[var(--osio-fg-muted)]";'],
  ["a semantic token", 'export const c = "bg-[var(--osio-bg-surface)]";'],
  ["an HTML entity", 'export const c = "&#x2713; &#123;";'],
  ["a union member named rounded", "export type Shape = 'rounded' | 'circle';"],
  ["a stored value that is exactly rounded", 'export const isShape = (v: string) => ["rounded", "circle"].includes(v);'],
  ["a template literal built from tokens", "export const c = (x: string) => `${x} rounded-md shadow-osio-e2 text-xs`;"],
];

for (const [name, code] of GOOD) {
  test(`stays silent on ${name}`, async () => {
    assert.deepEqual(await guardMessages(code), []);
  });
}

test("the same rules guard the UI kit", async () => {
  assert.ok((await guardMessages('export const c = "rounded text-[11px]";', KIT_COMPONENT)).length >= 2);
  assert.deepEqual(await guardMessages('export const c = "rounded-xs text-2xs";', KIT_COMPONENT), []);
});

test("a hex in a brand-catalog file passes", async () => {
  assert.deepEqual(await guardMessages('export const brand = "#1F5BC4";', BRAND_CATALOG), []);
});

test("a catalog file is still held to the class rules", async () => {
  const messages = await guardMessages('export const brand = "#1F5BC4"; export const c = "rounded shadow-md";', BRAND_CATALOG);
  assert.equal(messages.length, 2);
});

test("files outside src and the kit are not guarded", async () => {
  assert.deepEqual(await guardMessages('export const c = "rounded #fff";', "scripts/demo.ts"), []);
});
