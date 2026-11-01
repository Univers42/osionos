/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-mount-describe.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  describeLiveMount,
  registerCrossMountCatalog,
} from "../../src/shared/notion-database-sys/src/store/live/liveCrossMount.ts";

test("labels a catalogued mount with its engine and name", async () => {
  registerCrossMountCatalog(async () => [
    { dbId: "m-pg", name: "commerce", engine: "postgresql", tables: ["orders"] },
    { dbId: "m-redis", engine: "redis", tables: [] },
  ]);
  assert.equal(await describeLiveMount("m-pg"), "postgresql · commerce");
  assert.equal(await describeLiveMount("m-redis"), "redis", "a missing name drops its separator");
});

test("says nothing rather than guess for an unlisted or bare mount", async () => {
  registerCrossMountCatalog(async () => [{ dbId: "m-bare", tables: ["t"] }]);
  assert.equal(await describeLiveMount("m-bare"), null);
  assert.equal(await describeLiveMount("m-absent"), null);
  registerCrossMountCatalog(null);
  assert.equal(await describeLiveMount("m-bare"), null, "no catalog registered");
});

test("a failing catalog costs only the label", async () => {
  registerCrossMountCatalog(async () => { throw new Error("bridge down"); });
  assert.equal(await describeLiveMount("m-pg"), null);
  registerCrossMountCatalog(null);
});
