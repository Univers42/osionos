/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   duplicate-plan.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { planDuplicate } from "../../src/store/duplicatePlan.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

/**
 * Minimal page for planner tests; the planner only reads ids.
 * O(1) time and space.
 */
function makePage(id: string, parentPageId: string | null): PageEntry {
  return { _id: id, title: id, workspaceId: "ws", parentPageId };
}

test("plans a 3-level tree with parents before children", () => {
  const pages = [
    makePage("root", null),
    makePage("a", "root"),
    makePage("b", "root"),
    makePage("a1", "a"),
    makePage("a2", "a"),
    makePage("u1", null),
    makePage("u2", "u1"),
  ];
  const steps = planDuplicate(pages, "root");
  assert.equal(steps.length, 5);
  const first = steps[0];
  assert.equal(first.sourceId, "root");
  assert.equal(first.parentSourceId, null);
  const indexById = new Map<string, number>();
  for (const [index, step] of steps.entries()) {
    indexById.set(step.sourceId, index);
  }
  // Server replay needs the parent id before the child is created.
  for (const step of steps) {
    const parent = step.parentSourceId;
    if (parent === null) {
      continue;
    }
    const parentIndex = indexById.get(parent);
    const childIndex = indexById.get(step.sourceId);
    assert.ok(parentIndex !== undefined);
    assert.ok(childIndex !== undefined);
    if (parentIndex !== undefined && childIndex !== undefined) {
      assert.ok(parentIndex < childIndex);
    }
  }
});

test("a parent cycle terminates with each id listed once", () => {
  const pages = [makePage("x", "y"), makePage("y", "x")];
  const steps = planDuplicate(pages, "x");
  assert.equal(steps.length, 2);
  const ids = steps.map((step) => step.sourceId).sort();
  assert.deepEqual(ids, ["x", "y"]);
});

test("an unknown root plans nothing", () => {
  const pages = [makePage("a", null)];
  assert.deepEqual(planDuplicate(pages, "missing"), []);
});

test("a wide tree plans every child without blow-up", () => {
  const pages: PageEntry[] = [makePage("root", null)];
  for (let i = 0; i < 5000; i += 1) {
    pages.push(makePage(`c${i}`, "root"));
  }
  const steps = planDuplicate(pages, "root");
  assert.equal(steps.length, 5001);
});
