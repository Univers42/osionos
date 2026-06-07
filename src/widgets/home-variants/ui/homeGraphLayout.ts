/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphLayout.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { HomeGraphNode } from "../model/homeKnowledgeGraphData";
import { type SimNode, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./homeGraphModel";

export function createInitialNodes(nodes: HomeGraphNode[], previousNodes: SimNode[]): SimNode[] {
  return nodes.map((node, index) => {
    const previousNode = previousNodes.find((candidate) => candidate.id === node.id);
    const center = nodeCenter(node.kind);
    const angle = seededAngle(node.id, index);
    const radius = 42 + seededRadius(node.id, index);
    return {
      ...node,
      x: previousNode?.x ?? center.x + Math.cos(angle) * radius,
      y: previousNode?.y ?? center.y + Math.sin(angle) * radius,
    };
  });
}

function nodeCenter(kind: HomeGraphNode["kind"]): { x: number; y: number } {
  const centers: Record<HomeGraphNode["kind"], { x: number; y: number }> = {
    project: { x: 330, y: 245 },
    task: { x: 590, y: 250 },
    crm: { x: 840, y: 260 },
    content: { x: 400, y: 540 },
    inventory: { x: 670, y: 535 },
    product: { x: 900, y: 515 },
    page: { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 },
    folder: { x: VIEWBOX_WIDTH / 2, y: 150 },
  };
  return centers[kind];
}

function seededAngle(id: string, fallback: number): number {
  return (hashString(id) || fallback + 1) * 0.001618;
}

function seededRadius(id: string, fallback: number): number {
  return ((hashString(`${id}:${fallback}`) % 140) + Math.floor(fallback / 8) * 14);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + (value.codePointAt(index) ?? 0);
  }
  return Math.abs(hash);
}
