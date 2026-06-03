/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-aggregate.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { countFromRows, groupCountsFromRows } from "../../src/features/second-brain/baas/baasAggregate.ts";

// Real wire shapes captured from the live BaaS aggregate endpoint.
test("countFromRows reads the single-row count", () => {
  assert.equal(countFromRows([{ n: 330 }], "n"), 330);
  assert.equal(countFromRows([], "n"), 0);
});

test("groupCountsFromRows maps + sorts a real GROUP BY response", () => {
  const rows = [
    { n: 1, type: "authored_by" },
    { n: 98, type: "Related Assets" },
    { n: 25, type: "Project" },
    { n: 15, type: "Tasks" },
  ];
  const result = groupCountsFromRows(rows, "type", "n");
  assert.deepEqual(result.map((entry) => entry.key), ["Related Assets", "Project", "Tasks", "authored_by"]);
  assert.equal(result[0].count, 98);
});
