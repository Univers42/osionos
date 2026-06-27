/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-query-translator.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/09 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/09 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeLikePattern,
  LIVE_MAX_LIMIT,
  translateLivePageQuery,
} from "../../src/shared/notion-database-sys/src/store/live/liveQueryTranslator.ts";

// Expectations mirror data-plane-core/src/filter.rs: `{col: {"$op": v}}`,
// `$and`/`$not` composition, `$null` boolean, `$ilike` for ci contains.

test("eq/neq/range ops translate onto one column node", () => {
  const { params, clientSide } = translateLivePageQuery({
    filter: { status: { eq: "paid" }, total: { gte: 10, lt: 100 } },
    limit: 50,
  });
  assert.deepEqual(params.filter, {
    $and: [{ status: { $eq: "paid" } }, { total: { $gte: 10, $lt: 100 } }],
  });
  assert.equal(params.limit, 50);
  assert.deepEqual(clientSide, []);
});

test("single column collapses to a single node (no $and wrapper)", () => {
  const { params } = translateLivePageQuery({ filter: { status: { eq: "paid" } } });
  assert.deepEqual(params.filter, { status: { $eq: "paid" } });
});

test("in / nin / exists / contains translate per the wire grammar", () => {
  const { params, clientSide } = translateLivePageQuery({
    filter: {
      status: { in: ["paid", "pending"] },
      tag: { nin: ["junk"] },
      deleted_at: { exists: false },
      label: { contains: "10%_a" },
    },
  });
  assert.deepEqual(params.filter, {
    $and: [
      { status: { $in: ["paid", "pending"] } },
      { $not: { tag: { $in: ["junk"] } } },
      { deleted_at: { $null: true } }, // exists:false → IS NULL
      { label: { $ilike: "%10\\%\\_a%" } },
    ],
  });
  assert.deepEqual(clientSide, []);
});

test("unmappable ops are omitted server-side and reported", () => {
  const { params, clientSide } = translateLivePageQuery({
    filter: {
      tags: { contains: ["array-contains-is-not-ilike"] },
      $weird: { eq: 1 }, // $-fields are rejected by the wire grammar
    },
  });
  assert.equal(params.filter, undefined);
  assert.deepEqual(clientSide.sort(), ["$weird:*", "tags:contains"]);
});

test("only the first sort is sent (wire sort is a BTreeMap)", () => {
  const { params, clientSide } = translateLivePageQuery({
    sort: [
      { propertyId: "created_at", direction: "desc" },
      { propertyId: "label", direction: "asc" },
    ],
  });
  assert.deepEqual(params.sort, { created_at: "desc" });
  assert.deepEqual(clientSide, ["label:sort"]);
});

test("limit clamps into the router's 1..500 window", () => {
  assert.equal(translateLivePageQuery({ limit: 0 }).params.limit, 1);
  assert.equal(translateLivePageQuery({ limit: 9999 }).params.limit, LIVE_MAX_LIMIT);
  assert.equal(translateLivePageQuery({}).params.limit, undefined);
});

test("escapeLikePattern escapes %, _ and backslash", () => {
  assert.equal(escapeLikePattern("100%_done\\x"), "100\\%\\_done\\\\x");
});
