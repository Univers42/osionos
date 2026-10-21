/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   missing-page-settlement.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A content fetch that answers 404 (devil C132). Once the bridge answers 404 for a page the
// viewer lost access to, the old rule evicted a page holding an unpublished edit and the edit
// went with it, unsaid. The rule is pure (pageStore.actions pulls api/client, which the canvas
// loader cannot parse), so it is tested here and the action only applies it.

import assert from "node:assert/strict";
import test from "node:test";

import { settleMissingPage, type EvictablePageState } from "@/store/evictLocalPage";
import type { PageEntry } from "@/entities/page";

const WS = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";
const KEPT = "33333333-3333-4333-8333-333333333333";

function page(id: string, title: string): PageEntry {
  return { _id: id, workspaceId: WS, title, content: [] } as unknown as PageEntry;
}

function state(openId: string | null): EvictablePageState {
  return {
    pages: { [WS]: [page(GONE, "Q3 plan"), page(KEPT, "Notes")] },
    pageIdsByWorkspace: { [WS]: [GONE, KEPT] },
    activePage: openId ? ({ id: openId } as EvictablePageState["activePage"]) : null,
  } as EvictablePageState;
}

test("a page holding an unpublished edit is kept for the outbox to settle", () => {
  assert.equal(settleMissingPage(state(GONE), WS, GONE, false), null);
});

test("a clean page fetched in the background is evicted without a toast", () => {
  const settled = settleMissingPage(state(KEPT), WS, GONE, true);
  assert.ok(settled);
  assert.deepEqual(settled.state.pages[WS].map((p) => p._id), [KEPT]);
  assert.equal(settled.state.activePage?.id, KEPT, "another open tab stays open");
  assert.equal(settled.toast, null);
});

test("the open page is evicted, its tab closes, and the viewer is told once", () => {
  const settled = settleMissingPage(state(GONE), WS, GONE, true);
  assert.ok(settled);
  assert.deepEqual(settled.state.pages[WS].map((p) => p._id), [KEPT]);
  assert.equal(settled.state.activePage, null);
  assert.deepEqual(settled.toast, {
    kind: "warning",
    title: "“Q3 plan” is no longer available",
    description: "It was deleted or is no longer shared with you.",
  });
});
