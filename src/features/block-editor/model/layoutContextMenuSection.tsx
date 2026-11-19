/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutContextMenuSection.tsx                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { LayoutGrid } from "lucide-react";

import type { Block } from "@/entities/block";
import type { BlockContextMenuSection } from "./blockContextMenu.helpers";
import { layoutControlsFor } from "./layoutInspector";

/** Asks the editor surface that owns `sourceKey` to open the inspector on a block. */
export const LAYOUT_INSPECTOR_EVENT = "osionos:layout-inspector";

export interface LayoutInspectorRequest {
  sourceKey: string;
  blockId: string;
}

export function requestLayoutInspector(request: LayoutInspectorRequest): void {
  globalThis.dispatchEvent(new CustomEvent<LayoutInspectorRequest>(LAYOUT_INSPECTOR_EVENT, { detail: request }));
}

/** The block menu's Layout entry: only with osio.layout.modes on (ADR 0064 PS10). */
export function createLayoutContextMenuSections(block: Block, enabled: boolean, onOpen: () => void): BlockContextMenuSection[] {
  if (!enabled || layoutControlsFor(block).length === 0) return [];
  return [{ items: [{ icon: <LayoutGrid size={16} />, label: "Layout", onClick: onOpen }] }];
}
