/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphForces.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";

import { type SimLink, type SimNode, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./homeGraphModel";

export function linkDistance(link: SimLink): number {
  return 70 / Math.max(0.4, link.strength);
}

export function linkStrength(link: SimLink): number {
  return Math.min(0.6, 0.12 * link.strength);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The d3-force simulation used by the Second Brain graph (same forces/tuning as before). */
export function createSimulation(nodes: SimNode[], links: SimLink[]): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode>(nodes)
    .force("link", forceLink<SimNode, SimLink>(links).id((node) => node.id).distance(linkDistance).strength(linkStrength))
    .force("charge", forceManyBody<SimNode>().strength((node) => node.kind === "product" ? -42 : -105))
    .force("center", forceCenter<SimNode>(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2))
    .force("collide", forceCollide<SimNode>().radius((node) => Math.max(12, node.size + 8)).iterations(2))
    .alpha(0.95)
    .alphaDecay(0.035);
}
