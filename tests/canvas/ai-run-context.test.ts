/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-run-context.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the run is about: the pages the reader points at, with the "@".
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  addContextChip,
  buildRunContext,
  contextTrigger,
  MAX_CONTEXT_PAGES,
  WORKSPACE_CHIP,
  type ContextChip,
} from "@/features/ai/model/aiContext";

/* -------------------------------------------------------------------------- */
/* The context of a run                                                       */
/* -------------------------------------------------------------------------- */

function pageChip(id: string): ContextChip {
  return { id, kind: "page", label: id, pageId: id };
}

test("the chips are the context of the run", () => {
  const chips = [pageChip("a"), pageChip("b"), WORKSPACE_CHIP];
  assert.deepEqual(buildRunContext(chips), { pageIds: ["a", "b"], workspace: true });
});

test("a fourth page is refused, and the reader is told why", () => {
  let chips: ContextChip[] = [];
  for (const id of ["a", "b", "c"]) {
    const added = addContextChip(chips, pageChip(id));
    assert.equal(added.refusal, null, "three pages are allowed");
    chips = added.chips;
  }
  assert.equal(chips.length, MAX_CONTEXT_PAGES);

  const fourth = addContextChip(chips, pageChip("d"));
  assert.equal(fourth.chips.length, MAX_CONTEXT_PAGES, "the fourth page is not added");
  assert.match(fourth.refusal ?? "", /3 pages/, "and the reader is told in one line");
});

test("the same page twice is one chip", () => {
  const first = addContextChip([], pageChip("a"));
  const second = addContextChip(first.chips, pageChip("a"));
  assert.equal(second.chips.length, 1);
  assert.equal(second.refusal, null);
});

test("the whole workspace is one chip", () => {
  const first = addContextChip([], WORKSPACE_CHIP);
  const second = addContextChip(first.chips, WORKSPACE_CHIP);
  assert.equal(second.chips.length, 1);
  assert.deepEqual(buildRunContext(second.chips), { pageIds: [], workspace: true });
});

test("the @ opens the picker, and only when it stands alone", () => {
  assert.deepEqual(contextTrigger("look at @", 9), { query: "", start: 8 });
  assert.deepEqual(contextTrigger("look at @Alp", 12), { query: "Alp", start: 8 });
  assert.equal(contextTrigger("mail me at a@b.fr", 18), null, "an email address is not a trigger");
  assert.equal(contextTrigger("look at pages", 12), null);
});
