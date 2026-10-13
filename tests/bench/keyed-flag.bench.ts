/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keyed-flag.bench.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createKeyedFlag } from "../../src/shared/lib/subscriptions/keyedFlag.ts";
import { keyStore } from "../canvas/key-store-fixtures.ts";
import { defineBench } from "./harness.ts";

/** A sidebar of `rows` rows, each listening for its own page id. */
function sidebar(rows: number) {
  const store = keyStore("p0");
  const flag = createKeyedFlag(store.subscribe, store.read);
  let wakes = 0;
  for (let row = 0; row < rows; row += 1) flag.subscribe(`p${row}`, () => { wakes += 1; });
  return { store, wakes: () => wakes };
}

// Budgets ≈ 3x the p95 measured 2026-10-13: 50.9 ns when the key flips (two rows woken), 12.1 ns
// when it does not. Before, the active id was a prop: a navigation re-rendered all 1 000 rows.
export const bench = defineBench("keyed flag", [
  {
    name: "navigation (key flips) with 1 000 rows listening",
    budgetNs: 150,
    setup: () => {
      const { store } = sidebar(1_000);
      let flip = false;
      return () => {
        flip = !flip;
        store.set(flip ? "p1" : "p0");
      };
    },
  },
  {
    name: "store edit (key unchanged) with 1 000 rows listening",
    budgetNs: 40,
    setup: () => {
      const { store } = sidebar(1_000);
      return () => store.set("p0");
    },
  },
]);
