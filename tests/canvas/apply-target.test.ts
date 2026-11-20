/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   apply-target.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActivePage, PageEntry } from "@/entities/page";
import type { ApplyFailure } from "@/features/templates/model/applyToPage";
import { applyFailureText, applyTargetFor } from "@/features/templates/model/applyTarget";

function active(kind: ActivePage["kind"] = "page"): ActivePage {
  return { id: "p1", workspaceId: "ws", kind };
}

function page(overrides: Partial<PageEntry> = {}): PageEntry {
  return { _id: "p1", title: "Target", workspaceId: "ws", ...overrides };
}

test("applyTargetFor refuses without a page to apply to", () => {
  assert.deepEqual(applyTargetFor(null, page(), () => true), { ok: false, reason: "no-page" });
  assert.deepEqual(applyTargetFor(active("database"), page(), () => true), { ok: false, reason: "no-page" });
  assert.deepEqual(applyTargetFor(active("home"), page(), () => true), { ok: false, reason: "no-page" });
  assert.deepEqual(applyTargetFor(active(), undefined, () => true), { ok: false, reason: "no-page" });
});

test("applyTargetFor refuses a page the caller may not edit", () => {
  assert.deepEqual(applyTargetFor(active(), page(), () => false), { ok: false, reason: "read-only" });
});

test("applyTargetFor answers with the page id and whether the body is empty", () => {
  assert.deepEqual(applyTargetFor(active(), page({ content: [] }), () => true), { ok: true, pageId: "p1", empty: true });
  assert.deepEqual(applyTargetFor(active(), page({ content: undefined }), () => true), { ok: true, pageId: "p1", empty: true });
  assert.deepEqual(
    applyTargetFor(active(), page({ content: [{ id: "b1", type: "paragraph", content: "Line" }] }), () => true),
    { ok: true, pageId: "p1", empty: false },
  );
});

// Every reason ApplyFailure can carry; applyFailureText must answer each.
const FAILURES: ApplyFailure[] = [
  "read-only", "not-loaded", "db-read-only", "dangling-database",
  "not-open", "copy-failed", "changed-during-copy", "commit-failed",
];

test("applyFailureText gives every failure one plain sentence", () => {
  for (const reason of FAILURES) {
    const text = applyFailureText(reason, false);
    assert.ok(text.trim().length > 0, `${reason} has no text`);
    assert.match(text, /^[A-Z][^.]*\.$/);
    assert.ok(!text.includes("Your copy was kept."), `${reason} claims a copy it did not keep`);
  }
});

test("applyFailureText appends the kept-copy sentence only when a copy was kept", () => {
  for (const reason of FAILURES) {
    const plain = applyFailureText(reason, false);
    assert.equal(applyFailureText(reason, true), `${plain} Your copy was kept.`);
  }
});
