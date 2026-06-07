/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphSelection.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SimLink, SimNode } from "./homeGraphModel";

export function relatedNodeIdsFor(selectedNodeId: string | undefined, links: SimLink[]): Set<string> {
  const relatedIds = new Set<string>();
  if (!selectedNodeId) return relatedIds;
  relatedIds.add(selectedNodeId);
  for (const link of links) {
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    if (sourceId === selectedNodeId && targetId) relatedIds.add(targetId);
    if (targetId === selectedNodeId && sourceId) relatedIds.add(sourceId);
  }
  return relatedIds;
}

export function selectedLinksFor(selectedNodeId: string | undefined, links: SimLink[]): Set<string> {
  if (!selectedNodeId) return new Set<string>();
  return new Set(links
    .filter((link) => linkEndpointId(link.source) === selectedNodeId || linkEndpointId(link.target) === selectedNodeId)
    .map((link) => link.id));
}

export function resolveLinkNode(value: SimLink["source"]): SimNode | null {
  return typeof value === "string" ? null : value;
}

export function linkEndpointId(value: SimLink["source"]): string | null {
  return typeof value === "string" ? value : value.id;
}
