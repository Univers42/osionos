/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawBlockCanvas.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The embedded `draw` block — the /draw canvas living inside a page.
 *
 * Persistence: the engine's `onSceneChange` fires `.osidraw` JSON after every
 * mutation (incl. undo/redo); we debounce it into `block.content`, so the scene
 * rides the ORDINARY page-save path and survives reload with no extra table or
 * bridge route. The scene is loaded ONCE in `onReady` — never as a `scene` prop,
 * which would re-seed (and reset history) on every save we just made.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  DEFAULT_ELEMENT_STYLE,
  DrawCanvas,
  type DrawElement,
  type DrawElementStyle,
  type DrawEngine,
  type DrawTool,
  type TextEditRequest,
} from "@osionos/draw-engine";
import type { Block } from "@/entities/block";
import { DRAW_BLOCK_DEFAULT_HEIGHT } from "@/entities/block";
import { drawTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { setDrawBinding } from "../model/drawHandoff";
import { useCameraHud } from "../model/useCameraHud";
import { useDrawContextMenu } from "../model/useDrawContextMenu";
import { useResolvedDrawChrome } from "../model/useResolvedDrawChrome";
import { DrawContextMenu } from "./DrawContextMenu";
import { DrawInspector } from "./DrawInspector";
import { DrawTextEditor } from "./DrawTextEditor";
import { DrawToolbar } from "./DrawToolbar";
import { DrawZoomBar } from "./DrawZoomBar";

const SAVE_DEBOUNCE_MS = 400;
const MIN_HEIGHT = 200;

interface DrawBlockCanvasProps {
  block: Block;
  /** Owning page — needed so the full-app "expand" can save back into this block. */
  pageId?: string;
  readOnly?: boolean;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
}

function styleOf(element: DrawElement): DrawElementStyle {
  const { strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, roundness } = element;
  return { strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, roundness };
}

const DRAW_TOOLS = new Set<DrawTool>(["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "eraser"]);
const cursorForTool = (tool: DrawTool) =>
  tool === "text" ? "text" : DRAW_TOOLS.has(tool) ? "crosshair" : "default";

export function DrawBlockCanvas({ block, pageId, readOnly, onUpdateBlock }: DrawBlockCanvasProps) {
  const { theme, ink } = useResolvedDrawChrome();
  const [engine, setEngine] = useState<DrawEngine | null>(null);
  const [tool, setTool] = useState<DrawTool>("select");
  const [selectedCount, setSelectedCount] = useState(0);
  const [activeStyle, setActiveStyle] = useState<DrawElementStyle>(DEFAULT_ELEMENT_STYLE);
  const [textEdit, setTextEdit] = useState<TextEditRequest | null>(null);
  const [toolLocked, setToolLocked] = useState(false);
  const { zoom, contentVisible, onCameraChange } = useCameraHud(engine);
  const contextMenu = useDrawContextMenu(engine);

  const height = block.drawHeight ?? DRAW_BLOCK_DEFAULT_HEIGHT;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latch the commit fn + id so the debounced save never reads a stale closure.
  const commitRef = useRef({ id: block.id, save: onUpdateBlock });
  commitRef.current = { id: block.id, save: onUpdateBlock };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const syncStyle = useCallback((source: DrawEngine | null) => {
    if (!source) return;
    const selected = source.getSelectedElements();
    setActiveStyle(selected.length > 0 ? styleOf(selected[0]) : source.getNextStyle());
  }, []);

  // Hydrate from block.content exactly once, when the engine is born.
  const onReady = useCallback(
    (next: DrawEngine) => {
      if (block.content) next.loadScene(block.content);
      setEngine(next);
      syncStyle(next);
    },
    // block.content is read-once on mount by design — re-running on every save
    // would reload the scene under the user's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncStyle],
  );

  const onSceneChange = useCallback((json: string) => {
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { id, save } = commitRef.current;
      save?.(id, { content: json });
    }, SAVE_DEBOUNCE_MS);
  }, [readOnly]);

  const toggleToolLock = useCallback(() => {
    if (!engine) return;
    engine.setToolLocked(!engine.getToolLocked());
    setToolLocked(engine.getToolLocked());
  }, [engine]);

  const selectTool = useCallback((next: DrawTool) => engine?.setTool(next), [engine]);

  const onSelectionChange = useCallback((ids: string[]) => {
    setSelectedCount(ids.length);
    syncStyle(engine);
  }, [engine, syncStyle]);

  const applyStyle = useCallback((patch: Partial<DrawElementStyle>) => {
    engine?.applyStyle(patch);
    syncStyle(engine);
  }, [engine, syncStyle]);

  // Drag the bottom edge to resize the canvas; persists as block.drawHeight.
  // The sized wrapper is our PARENT div (BlockEditor owns the height style), so
  // the drag writes that wrapper's style directly and commits to the store ONCE
  // on release — a per-move save() ran the whole updateBlock pipeline (block-tree
  // rebuild, revision bump, cache persist) at pointer rate.
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ y: number; h: number; latest: number | null } | null>(null);
  const onResizeStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { y: event.clientY, h: height, latest: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [height]);
  const onResizeMove = useCallback((event: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const next = Math.max(MIN_HEIGHT, Math.round(r.h + (event.clientY - r.y)));
    r.latest = next;
    const wrapper = rootRef.current?.parentElement;
    if (wrapper) wrapper.style.height = `${next}px`;
  }, []);
  const onResizeEnd = useCallback(() => {
    const r = resizeRef.current;
    resizeRef.current = null;
    // The commit re-renders the wrapper with the same height we already set.
    if (r && r.latest !== null) commitRef.current.save?.(commitRef.current.id, { drawHeight: r.latest });
  }, []);

  // Expand: bind the singleton Draw tab to THIS block, then open it. The full app
  // hydrates from the block and writes edits straight back — a real round-trip.
  const onExpand = useCallback(() => {
    if (!pageId) return;
    setDrawBinding({ pageId, blockId: block.id, content: block.content ?? "" });
    useWorkspaceLayout.getState().openTab(drawTab());
  }, [pageId, block.id, block.content]);

  return (
    <div
      ref={rootRef}
      className="group/draw relative h-full w-full overflow-hidden"
      style={{ cursor: readOnly ? "default" : cursorForTool(tool) }}
    >
      <div style={readOnly ? { pointerEvents: "none", height: "100%" } : { height: "100%" }}>
        <DrawCanvas
          theme={theme}
          defaultStroke={ink}
          onReady={onReady}
          onSceneChange={onSceneChange}
          onCameraChange={onCameraChange}
          onToolChange={setTool}
          onSelectionChange={onSelectionChange}
          onRequestTextEdit={setTextEdit}
          onContextMenu={contextMenu.openAt}
          onToolLockChange={setToolLocked}
          ariaLabel="Drawing"
        />
      </div>

      {!readOnly && (
        <>
          <DrawToolbar active={tool} onSelect={selectTool} toolLocked={toolLocked} onToggleToolLock={toggleToolLock} />
          <DrawInspector style={activeStyle} selectedCount={selectedCount} onApply={applyStyle} engine={engine} />
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

          {pageId && (
            <button
              type="button"
              aria-label="Open drawing in the full Draw app"
              title="Open in full app"
              onClick={onExpand}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40 group-hover/draw:opacity-100 motion-reduce:opacity-100"
            >
              <Maximize2 size={14} />
            </button>
          )}

          {/* Resize grip — drag to grow the canvas. */}
          <div
            role="separator"
            aria-label="Resize drawing"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover/draw:opacity-100"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-[var(--osio-border-strong)]" />
          </div>
        </>
      )}
    </div>
  );
}
