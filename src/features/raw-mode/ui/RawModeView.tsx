/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawModeView.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useRef, useState } from "react";
import { usePageStore } from "@/store/usePageStore";
import { resolvePageConfig, usePageConfigStore } from "@/shared/config/pageConfigStore";
import { useUserStore } from "@/features/auth";
import { RawModeHeader } from "./RawModeHeader";
import { RawCodePane } from "./RawCodePane";
import { RawPreviewPane } from "./RawPreviewPane";
import { useRawMode } from "../model/useRawMode";
import { DEFAULT_RAW_LAYOUT, dropZoneFromX, ratioFromX, type RawLayout, type RawLayoutMode } from "../model/rawModeLayout";

/** VSCode-style raw markdown editor: tabs, a resizable split, and a drag-the-
 *  header gesture that previews the Code/Preview reorganization while sliding. */
export function RawModeView({ pageId }: Readonly<{ pageId: string }>) {
  const title = usePageStore((state) => state.pageById(pageId)?.title ?? "");
  const updateConfig = usePageConfigStore((state) => state.updateConfig);
  const userId = useUserStore((state) => state.activeUserId) || "anonymous";
  const showLineNumbers = usePageConfigStore((state) => resolvePageConfig(state.configs[`${userId}:${pageId}`]).showLineNumbers);
  const { source, edit, save, exit, dirty } = useRawMode(pageId);
  const [layout, setLayout] = useState<RawLayout>(DEFAULT_RAW_LAYOUT);
  const [dragZone, setDragZone] = useState<RawLayoutMode | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggleLineNumbers = useCallback(() => { void updateConfig(userId, pageId, { showLineNumbers: !showLineNumbers }); }, [pageId, showLineNumbers, updateConfig, userId]);

  const startHeaderDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let zone: RawLayoutMode = "split";
    const move = (moveEvent: PointerEvent) => { zone = dropZoneFromX(moveEvent.clientX, rect); setDragZone(zone); };
    const up = () => {
      setDragZone(null);
      setLayout((current) => ({ ...current, mode: zone }));
      globalThis.removeEventListener("pointermove", move);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "grabbing";
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up, { once: true });
  }, []);

  const startDividerDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (moveEvent: PointerEvent) => setLayout((current) => ({ ...current, ratio: ratioFromX(moveEvent.clientX, rect) }));
    const up = () => { globalThis.removeEventListener("pointermove", move); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up, { once: true });
  }, []);

  return (
    <div ref={containerRef} data-raw-mode className="relative flex h-full min-h-0 flex-col">
      <RawModeHeader title={title} mode={layout.mode} dirty={dirty} showLineNumbers={showLineNumbers} onMode={(mode) => setLayout((current) => ({ ...current, mode }))} onToggleLineNumbers={toggleLineNumbers} onSave={save} onExit={exit} onDragStart={startHeaderDrag} />
      <div className="flex min-h-0 flex-1">
        {layout.mode !== "preview" && (
          <div className="min-h-0" style={{ width: layout.mode === "split" ? `${layout.ratio * 100}%` : "100%" }}>
            <RawCodePane source={source} onChange={edit} showLineNumbers={showLineNumbers} />
          </div>
        )}
        {layout.mode === "split" && (
          <button type="button" aria-label="Resize panes" onPointerDown={startDividerDrag} className="w-1 shrink-0 cursor-col-resize bg-[var(--osio-border-default)] hover:bg-[var(--osio-accent)]" />
        )}
        {layout.mode !== "code" && (
          <div className="min-h-0 flex-1">
            <RawPreviewPane source={source} />
          </div>
        )}
      </div>
      {dragZone && <DropOverlay zone={dragZone} />}
    </div>
  );
}

function DropOverlay({ zone }: Readonly<{ zone: RawLayoutMode }>) {
  const cell = "m-1 flex items-center justify-center rounded border-2 border-dashed border-[var(--osio-accent)] bg-[var(--osio-accent)]/10 text-xs font-semibold text-[var(--osio-accent)]";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-9 z-[var(--osio-z-popover)] flex">
      {zone !== "preview" && <div className={`${zone === "split" ? "w-1/2" : "w-full"} ${cell}`}>Code</div>}
      {zone !== "code" && <div className={`${zone === "split" ? "w-1/2" : "w-full"} ${cell}`}>Preview</div>}
    </div>
  );
}
