/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasSettingsPanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { X } from "lucide-react";
import { useStore } from "zustand";

import type { CanvasStoreApi } from "../store/canvasStore";
import { CanvasNumberControl, CanvasSegmented, CanvasToggle } from "./CanvasInspectorControls";

type CanvasMode = "inline" | "full";

interface CanvasSettingsPanelProps {
  store: CanvasStoreApi;
  layoutMode: "inline" | "full_page";
  onSetLayoutMode: (mode: "inline" | "full_page") => void;
  onClose: () => void;
}

export const CanvasSettingsPanel: React.FC<CanvasSettingsPanelProps> = ({ store, layoutMode, onSetLayoutMode, onClose }) => {
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const dispatch = useStore(store, (state) => state.dispatch);

  return (
    <aside className="osionos-layout-settings-panel" aria-label="Layout settings">
      <button
        type="button"
        className="osionos-layout-panel-close-tab"
        onClick={onClose}
        aria-label="Close layout settings"
        title="Close panel"
      >
        <X size={14} aria-hidden />
      </button>
      <CanvasNumberControl label="Columns" value={layoutConfig.columns} min={1} max={24} onChange={(columns) => dispatch({ type: "updateLayoutConfig", patch: { columns } })} />
      <CanvasNumberControl label="Row height" value={layoutConfig.rowHeight} min={96} max={320} suffix="px" onChange={(rowHeight) => dispatch({ type: "updateLayoutConfig", patch: { rowHeight } })} />
      <CanvasNumberControl label="Gap" value={layoutConfig.columnGap} min={0} max={48} suffix="px" onChange={(gap) => dispatch({ type: "updateLayoutConfig", patch: { columnGap: gap, rowGap: gap } })} />
      <CanvasToggle label="Snap to grid" checked={layoutConfig.snapToGrid} onChange={(enabled) => dispatch({ type: "setSnapToGrid", enabled })} />
      <CanvasToggle label="No overlap" checked={layoutConfig.noOverlap} onChange={(enabled) => dispatch({ type: "setNoOverlap", enabled })} />
      <CanvasSegmented
        label="Guides"
        value={layoutConfig.guideVisibility}
        options={["auto", "always", "never"] as const}
        onChange={(guideVisibility) => dispatch({ type: "updateLayoutConfig", patch: { guideVisibility } })}
      />
      <CanvasSegmented
        label="Mode"
        value={layoutConfig.preview ? "view" : "edit"}
        options={["edit", "view"] as const}
        onChange={(mode) => dispatch({ type: "updateLayoutConfig", patch: { preview: mode === "view" } })}
      />
      <CanvasSegmented<CanvasMode>
        label="Canvas"
        value={layoutMode === "full_page" ? "full" : "inline"}
        options={["inline", "full"] as const}
        onChange={(mode) => onSetLayoutMode(mode === "full" ? "full_page" : "inline")}
      />
    </aside>
  );
};
