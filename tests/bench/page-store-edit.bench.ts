/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-store-edit.bench.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { derivePageState, updatePageInState } from "../../src/store/pageStore.helpers.ts";
import { replacePage } from "../../src/store/replacePage.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench } from "./harness.ts";

/** One title keystroke as the store commits it today: locate + copy + re-derive the indexes. */
function titleEditSlowPath(count: number): () => unknown {
  const state = derivePageState({ ws: generatedTree(count) });
  const pageId = `p${Math.floor(count / 2)}`;
  let flip = false;
  return () => {
    flip = !flip;
    const pages = updatePageInState(state.pages, pageId, (page) => ({ ...page, title: flip ? "a" : "b" }));
    return derivePageState(pages, state.pageIdsByWorkspace);
  };
}

/** The same keystroke through replacePage: O(1) lookup + one array copy, indexes reused. */
function titleEditFastPath(count: number): () => unknown {
  const state = derivePageState({ ws: generatedTree(count) });
  const pageId = `p${Math.floor(count / 2)}`;
  let flip = false;
  return () => {
    flip = !flip;
    return replacePage(state, pageId, (page) => ({ ...page, title: flip ? "a" : "b" }));
  };
}

export const bench = defineBench("page store edit", [
  {
    // 2026-10-13: median 588 µs, p95 0.75-1.53 ms (bash scripts/docker-run.sh test-bench
    // tests/bench/page-store-edit.bench.ts). The fallback path, and what every in-place edit
    // cost before replacePage.
    name: "title edit 10k (update + derive)",
    budgetNs: 4_500_000,
    setup: () => titleEditSlowPath(10_000),
  },
  {
    // 2026-10-13: median 3.93 µs, p95 5.52 µs (same command).
    name: "title edit 10k (replacePage)",
    budgetNs: 20_000,
    setup: () => titleEditFastPath(10_000),
  },
  {
    // 2026-10-13: median 453 ns, p95 715 ns (same command).
    name: "title edit 1k (replacePage)",
    budgetNs: 2_500,
    setup: () => titleEditFastPath(1_000),
  },
]);
