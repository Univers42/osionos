/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasEmptyState.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { CanvasTemplateKind } from "../model/templates";

export const CanvasEmptyState: React.FC<{
  onAdd: () => void;
  onTemplate: (kind: CanvasTemplateKind) => void;
}> = ({ onAdd, onTemplate }) => (
  <div className="osionos-layout-empty-state">
    <div className="text-3xl" aria-hidden>▦</div>
    <p className="text-sm font-medium text-[var(--osio-fg-default)]">Add cells to your layout</p>
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" onClick={onAdd}>+ Cell</button>
      <button type="button" onClick={() => onTemplate("dashboard")}>Use dashboard</button>
    </div>
    <div className="flex flex-wrap justify-center gap-1 text-xs text-[var(--osio-fg-subtle)]">
      <button type="button" onClick={() => onTemplate("kanban")}>Kanban</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("tracker")}>Tracker</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("notes")}>Two-column notes</button>
    </div>
  </div>
);
