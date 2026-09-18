/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawCanvasView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The full-page Draw surface, mounted by `tab.kind === "draw"`. Hosts the
 * @osionos/draw-engine canvas plus the toolbar, inspector, and HUD, and resolves
 * the canvas chrome + ink from live `--osio-*` tokens so it tracks the active
 * theme/palette. Block-bound drawings save into their block; scratch drawings
 * persist to localStorage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ELEMENT_STYLE,
  DrawCanvas,
  type DrawElement,
  type DrawElementStyle,
  type DrawEngine,
  type DrawTool,
  type TextEditRequest,
} from "@osionos/draw-engine";
import { usePageStore } from "@/store/usePageStore";
import { useCameraHud } from "../model/useCameraHud";
import { useDrawContextMenu } from "../model/useDrawContextMenu";
import { getDrawBinding } from "../model/drawHandoff";
import { useResolvedDrawChrome } from "../model/useResolvedDrawChrome";
import { DrawActions } from "./DrawActions";
import { DrawContextMenu } from "./DrawContextMenu";
import { DrawInspector } from "./DrawInspector";
import { DrawTextEditor } from "./DrawTextEditor";
import { DrawToolbar } from "./DrawToolbar";
import { DrawZoomBar } from "./DrawZoomBar";

/** An unbound (scratch) drawing persists here until a real bridge table exists.
 *  ponytail: localStorage ceiling — swap for bridge-draw persistence later. */
const SCRATCH_KEY = "osio.draw.scratch.v1";

function styleOf(element: DrawElement): DrawElementStyle {
  const { strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, roundness } = element;
  return { strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, roundness };
}

const DRAW_TOOLS = new Set<DrawTool>(["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "eraser"]);

function cursorForTool(tool: DrawTool): string {
  if (tool === "text") return "text";
  if (DRAW_TOOLS.has(tool)) return "crosshair";
  return "default";
}

export function DrawCanvasView() {
  const { theme, ink } = useResolvedDrawChrome();
  const [engine, setEngine] = useState<DrawEngine | null>(null);
  const [tool, setTool] = useState<DrawTool>("select");
  const [selectedCount, setSelectedCount] = useState(0);
  const [activeStyle, setActiveStyle] = useState<DrawElementStyle>(DEFAULT_ELEMENT_STYLE);
  const [textEdit, setTextEdit] = useState<TextEditRequest | null>(null);
  const [toolLocked, setToolLocked] = useState(false);
  const { zoom, contentVisible, onCameraChange } = useCameraHud(engine);

  const syncStyle = useCallback((source: DrawEngine | null) => {
    if (!source) return;
    const selected = source.getSelectedElements();
    setActiveStyle(selected.length > 0 ? styleOf(selected[0]) : source.getNextStyle());
  }, []);

  // When opened via a draw block's "expand", the tab is bound to that block:
  // hydrate from it, and write edits straight back so the full app persists too.
  const binding = useMemo(() => getDrawBinding(), []);
  const updateBlock = usePageStore((s) => s.updateBlock);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const onSceneChange = useCallback((json: string) => {
    if (!binding) {
      // Scratch drawing (opened from the View menu, not a block): survives
      // reload via localStorage until the bridge table exists.
      try {
        localStorage.setItem(SCRATCH_KEY, json);
      } catch {
        /* storage full/blocked — the drawing still lives in memory */
      }
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateBlock(binding.pageId, binding.blockId, { content: json });
    }, 400);
  }, [binding, updateBlock]);

  const onReady = useCallback((next: DrawEngine) => {
    if (binding?.content) next.loadScene(binding.content);
    else if (!binding) {
      const scratch = localStorage.getItem(SCRATCH_KEY);
      if (scratch) next.loadScene(scratch);
    }
    setEngine(next);
    syncStyle(next);
  }, [binding, syncStyle]);
  const onToolChange = useCallback((next: DrawTool) => setTool(next), []);
  const onSelectionChange = useCallback((ids: string[]) => {
    setSelectedCount(ids.length);
    syncStyle(engine);
  }, [engine, syncStyle]);

  const applyStyle = useCallback((patch: Partial<DrawElementStyle>) => {
    engine?.applyStyle(patch);
    syncStyle(engine);
  }, [engine, syncStyle]);
  const selectTool = useCallback((next: DrawTool) => engine?.setTool(next), [engine]);
  const onRequestTextEdit = useCallback((request: TextEditRequest) => setTextEdit(request), []);
  const contextMenu = useDrawContextMenu(engine);
  const toggleToolLock = useCallback(() => {
    if (!engine) return;
    engine.setToolLocked(!engine.getToolLocked());
    setToolLocked(engine.getToolLocked());
  }, [engine]);
  const cursor = useMemo(() => cursorForTool(tool), [tool]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor }}>
      <DrawCanvas
        theme={theme}
        defaultStroke={ink}
        onReady={onReady}
        onSceneChange={onSceneChange}
        onCameraChange={onCameraChange}
        onToolChange={onToolChange}
        onSelectionChange={onSelectionChange}
        onRequestTextEdit={onRequestTextEdit}
        onContextMenu={contextMenu.openAt}
        onToolLockChange={setToolLocked}
        ariaLabel="Draw canvas"
      />
      <DrawToolbar active={tool} onSelect={selectTool} toolLocked={toolLocked} onToggleToolLock={toggleToolLock} />
      <DrawInspector style={activeStyle} selectedCount={selectedCount} onApply={applyStyle} engine={engine} />
      <DrawActions engine={engine} />
      <DrawZoomBar engine={engine} zoom={zoom} contentVisible={contentVisible} />
      {textEdit && engine ? (
        <DrawTextEditor
          engine={engine}
          request={textEdit}
          fontSizePx={(textEdit.fontSize * zoom) / 100}
          onDone={() => setTextEdit(null)}
        />
      ) : null}
      {contextMenu.menu ? (
        <DrawContextMenu
          state={contextMenu.menu}
          onPickArrowhead={contextMenu.pickArrowhead}
          onRun={contextMenu.run}
          onClose={contextMenu.close}
        />
      ) : null}
    </div>
  );
}
