/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeKnowledgeGraphData.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState, PropertyType, SchemaProperty } from "@notion-db/object-database";

export type HomeGraphNodeKind = "project" | "task" | "crm" | "content" | "inventory" | "product" | "page";

export interface HomeGraphProperty {
  key: string;
  label: string;
  type: PropertyType;
  value: string | string[] | number | boolean | null;
  options?: string[];
  relationTarget?: string;
}

export interface HomeGraphNode {
  id: string;
  title: string;
  kind: HomeGraphNodeKind;
  databaseId: string;
  databaseName: string;
  group: string;
  size: number;
  value: number;
  properties: HomeGraphProperty[];
}

export interface HomeGraphLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  strength: number;
}

export interface HomeKnowledgeGraph {
  nodes: HomeGraphNode[];
  links: HomeGraphLink[];
  stats: {
    nodes: number;
    links: number;
    relationProperties: number;
    databases: number;
  };
}

const DATABASE_KIND: Record<string, HomeGraphNodeKind> = {
  "db-projects": "project",
  "db-tasks": "task",
  "db-crm": "crm",
  "db-content": "content",
  "db-inventory": "inventory",
  "db-products": "product",
};

export function createHomeKnowledgeGraph(state: NotionState): HomeKnowledgeGraph {
  const pages = Object.values(state.pages).filter((page) => !page.archived && state.databases[page.databaseId]);
  const nodes = pages.map((page) => createNode(state, page.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = createRelationLinks(state, nodeIds);
  const relationProperties = Object.values(state.databases).reduce(
    (total, database) => total + Object.values(database.properties).filter((property) => property.type === "relation").length,
    0,
  );

  return {
    nodes,
    links,
    stats: {
      nodes: nodes.length,
      links: links.length,
      relationProperties,
      databases: Object.keys(state.databases).length,
    },
  };
}

function createNode(state: NotionState, pageId: string): HomeGraphNode {
  const page = state.pages[pageId];
  const database = state.databases[page.databaseId];
  const properties = Object.values(database.properties).map((property) => createProperty(property, page.properties[property.id]));
  const relationCount = properties.reduce((total, property) => total + (property.type === "relation" ? arrayValue(property.value).length : 0), 0);
  const numericValue = firstNumericValue(properties);

  return {
    id: page.id,
    title: textValue(page.properties[database.titlePropertyId]) || "Untitled",
    kind: DATABASE_KIND[page.databaseId] ?? "page",
    databaseId: page.databaseId,
    databaseName: database.name,
    group: groupValue(database.properties, page.properties) || database.name,
    size: 9 + Math.min(16, relationCount * 2 + Math.log10(Math.max(1, numericValue)) * 1.6),
    value: numericValue,
    properties,
  };
}

function createProperty(property: SchemaProperty, value: unknown): HomeGraphProperty {
  return {
    key: property.id,
    label: property.name,
    type: property.type,
    value: normalizePropertyValue(value, property.type),
    options: property.options?.map((option) => option.value),
    relationTarget: property.relationConfig?.databaseId,
  };
}

function createRelationLinks(state: NotionState, nodeIds: Set<string>): HomeGraphLink[] {
  const links = new Map<string, HomeGraphLink>();
  for (const page of Object.values(state.pages)) {
    const database = state.databases[page.databaseId];
    if (!database || !nodeIds.has(page.id)) continue;
    collectPageRelationLinks(page.id, page.properties, Object.values(database.properties), nodeIds, links);
  }
  return [...links.values()];
}

function collectPageRelationLinks(
  pageId: string,
  values: Record<string, unknown>,
  properties: SchemaProperty[],
  nodeIds: Set<string>,
  links: Map<string, HomeGraphLink>,
): void {
  for (const property of properties.filter((candidate) => candidate.type === "relation")) {
    for (const targetId of arrayValue(values[property.id])) {
      addRelationLink(pageId, targetId, property, nodeIds, links);
    }
  }
}

function addRelationLink(
  sourceId: string,
  targetId: string,
  property: SchemaProperty,
  nodeIds: Set<string>,
  links: Map<string, HomeGraphLink>,
): void {
  if (!nodeIds.has(targetId) || targetId === sourceId) return;
  const key = relationKey(sourceId, targetId, property.id);
  if (links.has(key)) return;
  links.set(key, {
    id: key,
    source: sourceId,
    target: targetId,
    relation: property.name,
    strength: property.relationConfig?.type === "two_way" ? 1.8 : 1.2,
  });
}

function relationKey(source: string, target: string, propertyId: string): string {
  const [left, right] = [source, target].sort((a, b) => a.localeCompare(b));
  return `${left}--${right}:${propertyId}`;
}

function groupValue(properties: Record<string, SchemaProperty>, values: Record<string, unknown>): string {
  const groupProperty = Object.values(properties).find((property) => property.type === "status")
    ?? Object.values(properties).find((property) => property.type === "select");
  return groupProperty ? textValue(values[groupProperty.id]) : "";
}

function firstNumericValue(properties: HomeGraphProperty[]): number {
  const numeric = properties.find((property) => property.type === "number" && typeof property.value === "number");
  return typeof numeric?.value === "number" ? numeric.value : 1;
}

function normalizePropertyValue(value: unknown, type: PropertyType): HomeGraphProperty["value"] {
  if (type === "relation") return arrayValue(value);
  if (type === "checkbox") return Boolean(value);
  if (type === "number") return numberValue(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  const text = textValue(value);
  return text ? [text] : [];
}

function textValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}