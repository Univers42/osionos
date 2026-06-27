/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordTemplates.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * RecordTemplates for the record→note unification (workstream D). When the graph
 * opens an engine record, the bridge upserts a note with `database_id =
 * "baas:<dbId>:<table>"`; these templates key off that id (via the shared
 * templateRegistry, mirroring registerMarketplace) so a commerce order or an ops
 * task gets the right title field + sub-page strip. Reuses the existing
 * RecordTemplate type — no new shape invented. dbIds are the seeded agency mounts.
 */

import type { RecordTemplate } from "./recordTemplate";
import { registerRecordTemplate } from "./templateRegistry";

const PG_COMMERCE = "59939f19-7e8d-4876-a57f-61b3e7bb37be";
const MYSQL_OPS = "028b32b2-78f2-405f-81e3-fa690c4649dc";

/** `baas:<dbId>:<table>` — the database_id the bridge stamps on a record note. */
function recordDatabaseId(dbId: string, table: string): string {
  return `baas:${dbId}:${table}`;
}

const OVERVIEW_PAGES: RecordTemplate["subPages"] = [
  { slug: "overview", title: "Overview", icon: "icon:file-text" },
  { slug: "activity", title: "Activity", icon: "icon:history", rail: true },
];

/** Per-table record templates (commerce + ops). Sub-pages mirror the marketplace strip. */
const TEMPLATES: Array<{ dbId: string; table: string; template: RecordTemplate }> = [
  { dbId: PG_COMMERCE, table: "orders", template: { id: "commerce.orders.v1", subPages: OVERVIEW_PAGES } },
  { dbId: PG_COMMERCE, table: "customers", template: { id: "commerce.customers.v1", subPages: OVERVIEW_PAGES } },
  { dbId: PG_COMMERCE, table: "products", template: { id: "commerce.products.v1", subPages: OVERVIEW_PAGES } },
  { dbId: MYSQL_OPS, table: "tasks", template: { id: "ops.tasks.v1", subPages: OVERVIEW_PAGES } },
  { dbId: MYSQL_OPS, table: "tickets", template: { id: "ops.tickets.v1", subPages: OVERVIEW_PAGES } },
];

let registered = false;

/** Register the commerce + ops record templates against their `baas:` database ids (idempotent). */
export function registerRecordTemplates(): void {
  if (registered) return;
  registered = true;
  for (const { dbId, table, template } of TEMPLATES) {
    registerRecordTemplate(recordDatabaseId(dbId, table), template);
  }
}
