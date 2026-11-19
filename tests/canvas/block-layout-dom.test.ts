// The markup PageBlocksRenderer gives the layout fixtures, held against the snapshot taken on the
// parent commit (f5eb51ca0) before layout modes existed (ADR 0064 PS4, PS7, PS8, PS10).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/user-store-env.ts";

const { PageBlocksRenderer } = await import("../../src/widgets/page-renderer/ui/PageBlocksRenderer.tsx");
const { PLAIN, STYLED } = await import("./fixtures/blockLayoutBlocks.ts");
const { LayoutModesContext } = await import("../../src/entities/block/ui/layoutModes.tsx");

Reflect.set(globalThis, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });

const SNAPSHOT = JSON.parse(readFileSync(new URL("./fixtures/blockLayoutDom.snapshot.json", import.meta.url), "utf8")) as {
  plain: string;
  styled: string;
};

const render = (blocks: unknown): string =>
  renderToStaticMarkup(React.createElement(PageBlocksRenderer, { blocks: blocks as never }));
const renderOn = (blocks: unknown): string =>
  renderToStaticMarkup(
    React.createElement(LayoutModesContext.Provider, { value: true }, React.createElement(PageBlocksRenderer, { blocks: blocks as never })),
  );
const pick = (id: string) => STYLED.filter((block) => block.id === id);
const rowAttributes = (html: string): string[] =>
  [...html.matchAll(/<div class="osio-columns-row[^"]*"([^>]*)>/g)].map((match) => match[1].trim());

test("flag off: blocks without style render the parent commit's markup", () => {
  assert.equal(render(PLAIN), SNAPSHOT.plain);
});

test("flag off: styled blocks render as plain blocks and columns, as before", () => {
  assert.equal(render(STYLED), SNAPSHOT.styled);
});

test("flag on: blocks without style still render the parent commit's markup (PS4, PS8)", () => {
  assert.equal(renderOn(PLAIN), SNAPSHOT.plain);
});

test("flag on: a style on a list changes only its data-s-* attributes", () => {
  const on = renderOn(pick("gap-only"));
  assert.match(on, /data-s-gap="2"/);
  assert.equal(on.replace(/ data-s-[a-zA-Z]+="[^"]*"/g, ""), render(pick("gap-only")));
});

test("flag on: a style with no scale value adds nothing", () => {
  assert.equal(renderOn(pick("s-junk")), render(pick("s-junk")));
});

test("flag on: a styled block gets one wrapper carrying its attributes", () => {
  const wrapper = '<div data-s-surface="muted" data-s-padding="3">';
  const on = renderOn(pick("s-pad"));
  assert.ok(on.includes(wrapper), on);
  assert.equal(on.replace(wrapper, "").replace(/<\/div><\/div>$/, "</div>"), render(pick("s-pad")));
});

test("flag on: a section renders its grid as one nested row (PS7)", () => {
  const html = renderOn(pick("section"));
  assert.deepEqual(rowAttributes(html), [
    'data-s-surface="muted" data-s-padding="4"',
    'data-s-gap="4" data-s-layout="grid" data-s-cols="3" data-s-minCol="16"',
  ]);
  assert.equal(html.match(/data-s-span="2"/g)?.length, 1);
  for (const text of ["Card one", "Card two", "Card three", "Aside"]) assert.ok(html.includes(text), text);
});
