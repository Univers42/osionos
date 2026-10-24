/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   record-page-id.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A projected engine row must never look like a server page: the outbox and
// every content fetch key off the id's SHAPE, so a raw UUID row id gets PATCHed
// to /api/pages and 404s. toRecordPageId namespaces it away from both shapes.

import assert from "node:assert/strict";
import test from "node:test";

import { toRecordPageId } from "../../src/widgets/database-view/model/recordPageId.ts";
import { isPersistablePage } from "../../src/store/sync/pageStamp.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const ROW_UUID = "64be6fac-a9bd-4564-bc12-56f8628b0356";

function mkPage(id: string): PageEntry {
  return { _id: id, title: "Deal", workspaceId: "ws-1" };
}

test("toRecordPageId: namespaces a UUID row id", () => {
  assert.equal(toRecordPageId(ROW_UUID), `dbrow-${ROW_UUID}`);
});

test("toRecordPageId: is idempotent", () => {
  assert.equal(toRecordPageId(toRecordPageId(ROW_UUID)), toRecordPageId(ROW_UUID));
});

test("the outbox skips the projection: a raw row UUID publishes, its projection never does", () => {
  assert.equal(isPersistablePage(mkPage(ROW_UUID)), true);
  assert.equal(isPersistablePage(mkPage(toRecordPageId(ROW_UUID))), false);
});
