/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphModel.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";

import type { HomeGraphLink, HomeGraphNode } from "../model/homeKnowledgeGraphData";

export interface SimNode extends HomeGraphNode, SimulationNodeDatum {}
export interface SimLink extends Omit<HomeGraphLink, "source" | "target">, SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export interface NodePointerState {
  id: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

export interface PanPointerState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

export const VIEWBOX_WIDTH = 1180;
export const VIEWBOX_HEIGHT = 760;
export const MIN_ZOOM = 0.36;
export const MAX_ZOOM = 3.2;
export const CLICK_DRAG_THRESHOLD = 5;
export const SECOND_BRAIN_PAGE_PREFIX = "second-brain";

export const NODE_COLORS: Record<HomeGraphNode["kind"], string> = {
  project: "#2563eb",
  task: "#0f766e",
  crm: "#b45309",
  content: "#be123c",
  inventory: "#4d7c0f",
  product: "#64748b",
  page: "#7c3aed",
  folder: "#94a3b8", // muted slate: a "gap" node that only links/organizes (not a note)
};

export const KIND_LABELS: Record<HomeGraphNode["kind"], string> = {
  project: "Projects",
  task: "Tasks",
  crm: "CRM",
  content: "Content",
  inventory: "Inventory",
  product: "Products",
  page: "Pages",
  folder: "Folders",
};
