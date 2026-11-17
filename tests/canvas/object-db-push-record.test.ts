/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-db-push-record.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createPushRecord } from "../../src/widgets/database-view/model/objectDatabasePushRecord.ts";

test("a snapshot is a copy: changing it never changes the record", () => {
  const record = createPushRecord({ a: "h1" });
  const snapshot = record.snapshot();
  snapshot.a = "changed";
  assert.deepEqual(record.snapshot(), { a: "h1" });
});

test("the version moves only when an entry changes", () => {
  const record = createPushRecord({ a: "h1" });
  const start = record.version;
  record.set("a", "h1");
  record.delete("missing");
  record.replace({ a: "h1" });
  assert.equal(record.version, start, "no change, no new version");
  record.set("a", "h2");
  record.delete("a");
  record.replace({ b: "h3" });
  assert.equal(record.version, start + 3);
  assert.deepEqual(record.snapshot(), { b: "h3" });
});
