/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseInput.ts                                     +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The databases a schema or a pipeline diagram is drawn from (devil C110).
 *
 * The spec names a DATABASE; the data it is drawn from is the state the
 * VIEWER's client already holds. This file is the ADAPTER between the two:
 * the records of the store become the little shapes the pure compilers take.
 *
 * Two rules hold the line: a database the client does NOT hold is SKIPPED,
 * never drawn as an unnamed node (an id is a lookup key into the viewer's own
 * store, and a key that resolves to nothing resolves to nothing); and a
 * database id never reaches the diagram as TEXT (the emitter generates the
 * node ids: `n0`, `n1`, …).
 *
 * This file is PURE: it reads no store, no network and no clock.
 */

import type { PipelineRow, SchemaDatabase, StatusOption } from "./compile";

/** The little a database diagram needs to know about a property. */
export interface PropertyLike {
  id: string;
  name: string;
  type: string;
  options?: { id: string; value: string }[];
  relationConfig?: { databaseId: string };
}

/** The little a database diagram needs to know about a database. */
export interface DatabaseLike {
  id: string;
  name: string;
  titlePropertyId: string;
  properties: Record<string, PropertyLike>;
}

/** The little a pipeline needs to know about a row. */
export interface PageLike {
  id: string;
  databaseId: string;
  properties: Record<string, unknown>;
}

/** The property types a pipeline can group its rows by. */
const STATUS_TYPES = ["status", "select"];

/**
 * The databases of `ids` the client holds, as the schema compiler takes them.
 *
 * An id that is not in the store is skipped. The order of `ids` does not
 * matter: the compiler sorts the databases by name before drawing them.
 */
export function schemaInput(databases: Record<string, DatabaseLike>, ids: string[]): SchemaDatabase[] {
  const out: SchemaDatabase[] = [];
  for (const id of ids) {
    const database = databases[id];
    if (!database) continue;
    const properties = Object.values(database.properties).map((property) => ({
      id: property.id,
      name: property.name,
      type: property.type,
      relationTo: property.relationConfig?.databaseId,
    }));
    out.push({ id: database.id, name: database.name, properties });
  }
  return out;
}

/**
 * The rows of a database, grouped by the value of one status property.
 *
 * Null when the database is not in the store, when the property is not there,
 * or when the property is not a `status`/`select`: a pipeline of a column that
 * holds no status is not a pipeline.
 */
export function pipelineInput(
  databases: Record<string, DatabaseLike>,
  pages: Record<string, PageLike>,
  databaseId: string,
  statusPropertyId: string,
): { options: StatusOption[]; rows: PipelineRow[] } | null {
  const database = databases[databaseId];
  if (!database) return null;
  const property = database.properties[statusPropertyId];
  if (!property || !STATUS_TYPES.includes(property.type)) return null;
  const options: StatusOption[] = (property.options ?? []).map((option) => ({
    id: option.id,
    name: option.value,
  }));
  const rows: PipelineRow[] = [];
  for (const page of Object.values(pages)) {
    if (page.databaseId !== databaseId) continue;
    const title = page.properties[database.titlePropertyId];
    const status = page.properties[statusPropertyId];
    rows.push({
      id: page.id,
      title: typeof title === "string" ? title : "",
      statusId: typeof status === "string" ? status : "",
    });
  }
  return { options, rows };
}

/** The properties of a database a pipeline can group its rows by. */
export function statusProperties(database: DatabaseLike): { id: string; name: string }[] {
  return Object.values(database.properties)
    .filter((property) => STATUS_TYPES.includes(property.type))
    .map((property) => ({ id: property.id, name: property.name }));
}
