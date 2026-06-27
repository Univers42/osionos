/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateContent.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { instantiateTemplateContent } from "@/store/pageStore.helpers";
import type { Block } from "@/entities/block";

const block = (id: string, type: Block["type"], content: string, extra: Partial<Block> = {}): Block =>
  ({ id, type, content, ...extra }) as Block;

test("instantiateTemplateContent resets placeholder content but preserves the prompt", () => {
  const source: Block[] = [
    block("p1", "paragraph", "kept text"),
    block("ph1", "placeholder", "filled value", { placeholderText: "Project name" }),
  ];
  const out = instantiateTemplateContent(source);

  assert.equal(out[0].content, "kept text"); // non-placeholder untouched
  assert.equal(out[1].content, ""); // placeholder filled value reset
  assert.equal(out[1].placeholderText, "Project name"); // prompt preserved
});

test("instantiateTemplateContent deep-clones (no shared refs with the template)", () => {
  const source: Block[] = [block("p1", "paragraph", "x")];
  const out = instantiateTemplateContent(source);
  out[0].content = "mutated";
  assert.equal(source[0].content, "x"); // template untouched
  assert.notEqual(out[0], source[0]);
});

test("instantiateTemplateContent recurses into children and layout cells", () => {
  const source: Block[] = [
    block("toggle", "toggle", "t", {
      children: [block("childPh", "placeholder", "child value", { placeholderText: "Owner" })],
    }),
    block("layout", "layout", "", {
      layoutCells: [
        { id: "c1", colStart: 0, colSpan: 1, rowStart: 0, rowSpan: 1, blocks: [block("cellPh", "placeholder", "cell value", { placeholderText: "Due" })] },
      ],
    }),
  ];
  const out = instantiateTemplateContent(source);

  assert.equal(out[0].children?.[0].content, "");
  assert.equal(out[0].children?.[0].placeholderText, "Owner");
  assert.equal(out[1].layoutCells?.[0].blocks[0].content, "");
  assert.equal(out[1].layoutCells?.[0].blocks[0].placeholderText, "Due");
});

test("instantiateTemplateContent handles empty/undefined", () => {
  assert.deepEqual(instantiateTemplateContent(undefined), []);
  assert.deepEqual(instantiateTemplateContent([]), []);
});
