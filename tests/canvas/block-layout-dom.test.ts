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

Reflect.set(globalThis, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });

const SNAPSHOT = JSON.parse(readFileSync(new URL("./fixtures/blockLayoutDom.snapshot.json", import.meta.url), "utf8")) as {
  plain: string;
  styled: string;
};

const render = (blocks: unknown): string =>
  renderToStaticMarkup(React.createElement(PageBlocksRenderer, { blocks: blocks as never }));

test("flag off: blocks without style render the parent commit's markup", () => {
  assert.equal(render(PLAIN), SNAPSHOT.plain);
});

test("flag off: styled blocks render as plain blocks and columns, as before", () => {
  assert.equal(render(STYLED), SNAPSHOT.styled);
});
