/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeSecondBrainPage.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";

import type { HomeGraphNode, HomeGraphProperty } from "../model/homeKnowledgeGraphData";
import { KIND_LABELS, SECOND_BRAIN_PAGE_PREFIX } from "./homeGraphModel";
import { formatPropertyValue } from "./homeGraphValue";
import { toPageProperty } from "./homeSecondBrainProps";

export function createSecondBrainPage(
  node: HomeGraphNode,
  properties: HomeGraphProperty[],
  workspaceId: string,
  activeUserId: string | null,
): PageEntry {
  const now = new Date().toISOString();
  return {
    _id: secondBrainPageId(node),
    title: node.title,
    updatedAt: now,
    workspaceId,
    ownerId: activeUserId,
    visibility: "private",
    collaborators: [],
    parentPageId: null,
    databaseId: node.databaseId,
    archivedAt: null,
    surface: "page",
    properties: properties.map(toPageProperty),
    content: createSecondBrainContent(node, properties),
  };
}

function createSecondBrainContent(node: HomeGraphNode, properties: HomeGraphProperty[]): Block[] {
  const relationProperties = properties.filter((property) => property.type === "relation");
  const scalarProperties = properties.filter((property) => property.type !== "relation").slice(0, 8);
  return [
    block(node, "summary", "callout", `${KIND_LABELS[node.kind]} / ${node.group}`),
    block(node, "properties-heading", "heading_2", "Properties"),
    ...scalarProperties.map((property) => block(node, `prop-${property.key}`, "bulleted_list", `${property.label}: ${formatPropertyValue(property.value)}`)),
    block(node, "relations-heading", "heading_2", "Relations"),
    ...relationProperties.map((property) => block(node, `relation-${property.key}`, "bulleted_list", `${property.label}: ${formatPropertyValue(property.value)}`)),
  ];
}

function block(node: HomeGraphNode, suffix: string, type: Block["type"], content: string): Block {
  return { id: `${secondBrainPageId(node)}-${suffix}`, type, content };
}

export function secondBrainPageId(node: HomeGraphNode): string {
  return `${SECOND_BRAIN_PAGE_PREFIX}-${node.kind}-${node.id}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}

export function upsertPage(workspacePages: PageEntry[], page: PageEntry): PageEntry[] {
  const existingIndex = workspacePages.findIndex((candidate) => candidate._id === page._id);
  if (existingIndex === -1) return [page, ...workspacePages];
  return workspacePages.map((candidate, index) => index === existingIndex ? { ...candidate, ...page } : candidate);
}
