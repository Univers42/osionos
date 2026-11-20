/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databases.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DatabaseSlice } from "@/features/templates/model/templateSlice";
import type { Page, SchemaProperty, ViewConfig } from "@notion-db/contract-types";

export const CATALOGUE_TIME = "2026-11-20T00:00:00.000Z";

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item] as const));
}

function assertOwner(databaseId: string, ownedBy: string): void {
  if (databaseId !== ownedBy) throw new Error(`databaseId ${databaseId} does not match ${ownedBy}`);
}

export function record(id: string, databaseId: string, properties: Record<string, unknown>): Page {
  return {
    id, databaseId, properties, content: [],
    createdAt: CATALOGUE_TIME, updatedAt: CATALOGUE_TIME,
    createdBy: "osionos", lastEditedBy: "osionos",
  };
}

export function database(spec: {
  id: string; name: string; icon?: string; properties: SchemaProperty[]; views: ViewConfig[]; rows: Page[];
}): DatabaseSlice {
  const title = spec.properties.find((property) => property.type === "title");
  if (!title) throw new Error(`Database ${spec.id} has no title property`);
  for (const view of spec.views) assertOwner(view.databaseId, spec.id);
  for (const row of spec.rows) assertOwner(row.databaseId, spec.id);
  const schema = {
    id: spec.id, name: spec.name, ...(spec.icon === undefined ? {} : { icon: spec.icon }),
    properties: byId(spec.properties), titlePropertyId: title.id, viewOrder: spec.views.map((view) => view.id),
  };
  return { databases: { [spec.id]: schema }, views: byId(spec.views), pages: byId(spec.rows) };
}

function mergeMaps<T>(maps: Array<Record<string, T>>): Record<string, T> {
  const merged = Object.create(null) as Record<string, T>;
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(merged, key)) throw new Error(`duplicate catalogue key: ${key}`);
      merged[key] = value;
    }
  }
  return { ...merged };
}

export function mergeSlices(...slices: DatabaseSlice[]): DatabaseSlice {
  return {
    databases: mergeMaps(slices.map((slice) => slice.databases)),
    views: mergeMaps(slices.map((slice) => slice.views)),
    pages: mergeMaps(slices.map((slice) => slice.pages)),
  };
}
