/**
 * The React host for DrawEngine: mounts one <canvas>, tracks size via
 * ResizeObserver, and forwards pointer + keyboard input to the engine's
 * interaction layer (pan/zoom, shape drawing, erase, tool hotkeys). Thin adapter —
 * no drawing or tool logic lives here; the engine owns it.
 */

import { useEffect, useRef } from "react";
import type { Camera } from "../core/camera/transform";
import { DrawEngine } from "../core/engine";
import type { TextEditRequest } from "../core/engine";
import { type DrawTool, toolForKey } from "../core/interaction/tools";
import { type DrawTheme, LIGHT_THEME } from "../core/render/paint";
import type { Scene } from "../core/scene/scene";

export interface DrawCanvasProps {
  scene?: Scene;
  theme?: DrawTheme;
  /** Stroke color new shapes adopt (the shell resolves a theme token so ink is
   *  visible in both light and dark). */
  defaultStroke?: string;
  className?: string;
  ariaLabel?: string;
  onReady?: (engine: DrawEngine) => void;
  onCameraChange?: (camera: Camera) => void;
  onToolChange?: (tool: DrawTool) => void;
  onSelectionChange?: (ids: string[]) => void;
  onRequestTextEdit?: (request: TextEditRequest) => void;
  /** `.osidraw` JSON after every scene mutation — persist it. */
  onSceneChange?: (json: string) => void;
  /** Right-click at a canvas-local point, after the engine has selected whatever
   *  sits under it — the host opens its context menu (e.g. arrowhead choice). */
  onContextMenu?: (point: { x: number; y: number }) => void;
  /** The keep-tool padlock was toggled (Q) — hosts mirror it in the toolbar. */
  onToolLockChange?: (locked: boolean) => void;
}

export function DrawCanvas({
  scene,
  theme = LIGHT_THEME,
  defaultStroke,
  className,
  ariaLabel = "Drawing canvas",
  onReady,
  onCameraChange,
  onToolChange,
  onSelectionChange,
  onRequestTextEdit,
  onSceneChange,
  onContextMenu,
  onToolLockChange,
}: DrawCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DrawEngine | null>(null);
  const cameraCbRef = useRef(onCameraChange);
  cameraCbRef.current = onCameraChange;
  const toolCbRef = useRef(onToolChange);
  toolCbRef.current = onToolChange;
  const selectionCbRef = useRef(onSelectionChange);
  selectionCbRef.current = onSelectionChange;
  const textEditCbRef = useRef(onRequestTextEdit);
  textEditCbRef.current = onRequestTextEdit;
  const sceneCbRef = useRef(onSceneChange);
  sceneCbRef.current = onSceneChange;
  const contextCbRef = useRef(onContextMenu);
  contextCbRef.current = onContextMenu;
  const toolLockCbRef = useRef(onToolLockChange);
  toolLockCbRef.current = onToolLockChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new DrawEngine({
      canvas,
      onCameraChange: (camera) => cameraCbRef.current?.(camera),
      onToolChange: (tool) => toolCbRef.current?.(tool),
      onSelectionChange: (ids) => selectionCbRef.current?.(ids),
      onRequestTextEdit: (request) => textEditCbRef.current?.(request),
      onSceneChange: (json) => sceneCbRef.current?.(json),
    });
    engineRef.current = engine;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      engine.setViewport(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);

    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) engine.zoomAt(sx, sy, Math.exp(-event.deltaY * 0.01));
      else engine.panBy(-event.deltaX, -event.deltaY);
    };

    let down = false;
    let spaceHeld = false;
    // Coalesce pointermove to one engine step per animation frame: high-rate
    // mice fire at 125–250 Hz, and each move in a drag runs snapping + a
    // full-scene binding refresh — work that can only be seen once per painted
    // frame anyway. The latest event wins; pointer-up flushes synchronously so
    // the gesture commits at the true release position, and pointer-down drops
    // any stale queued move so it can't leak into the next gesture.
    let moveRaf = 0;
    let pendingMove: PointerEvent | null = null;
    const processMove = (event: PointerEvent) => {
      const { x, y } = localPoint(event);
      engine.movePointer(x, y, event.shiftKey, event.altKey);
    };
    const clearPendingMove = () => {
      if (moveRaf) cancelAnimationFrame(moveRaf);
      moveRaf = 0;
      pendingMove = null;
    };
    const flushPendingMove = () => {
      const queued = pendingMove;
      clearPendingMove();
      if (queued) processMove(queued);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) return; // the contextmenu handler owns right-click
      clearPendingMove();
      down = true;
      container.focus();
      const { x, y } = localPoint(event);
      canvas.setPointerCapture(event.pointerId);
      // Middle mouse or held Space pans from any tool (Excalidraw muscle memory).
      if (event.button === 1 || spaceHeld) {
        event.preventDefault();
        engine.beginPan(x, y);
        return;
      }
      engine.beginPointer(x, y, event.shiftKey, event.altKey);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!down) return;
      pendingMove = event;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const queued = pendingMove;
        pendingMove = null;
        if (queued && down) processMove(queued);
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      flushPendingMove();
      down = false;
      engine.endPointer();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    // Double-click is how text is written: into a shape (as a centred label) or
    // straight onto the canvas.
    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      engine.handleDoubleClick(event.clientX - rect.left, event.clientY - rect.top);
      event.preventDefault();
    };

    // Right-click selects what is under the cursor first, so the host menu can act
    // on it (choosing the extremities of the arrow you actually clicked). The canvas
    // OWNS its right-click — without stopPropagation the embedding page opens its own
    // block menu on top of ours (same reason it owns its hotkeys).
    const onContext = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = engine.hitTest(x, y, 4);
      if (hit) engine.select([hit.id]);
      else engine.clearSelection();
      contextCbRef.current?.({ x, y });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        engine.cancelPointer();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        engine.deleteSelection();
        event.preventDefault();
        return;
      }
      if (event.key.startsWith("Arrow") && !mod) {
        if (engine.getSelection().length === 0) return;
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        engine.nudgeSelection(dx, dy);
        event.preventDefault();
        return;
      }
      if (event.key === " " && !mod) {
        if (!event.repeat) spaceHeld = true;
        event.preventDefault(); // no page scroll while panning
        return;
      }
      if (mod && event.key.toLowerCase() === "z") {
        if (event.shiftKey) engine.redo();
        else engine.undo();
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        engine.redo();
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        engine.selectAll();
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        engine.duplicateSelection();
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "g") {
        if (event.shiftKey) engine.ungroupSelection();
        else engine.groupSelection();
        event.preventDefault();
        return;
      }
      if (mod && (event.key === "]" || event.key === "[")) {
        const toEnd = event.altKey;
        engine.reorderSelection(event.key === "]" ? (toEnd ? "front" : "forward") : toEnd ? "back" : "backward");
        event.preventDefault();
        return;
      }
      if (mod && (event.key === "=" || event.key === "+")) {
        engine.zoomIn();
        event.preventDefault();
        return;
      }
      if (mod && (event.key === "-" || event.key === "_")) {
        engine.zoomOut();
        event.preventDefault();
        return;
      }
      if (mod && event.key === "0") {
        engine.zoomReset();
        event.preventDefault();
        return;
      }
      if (event.shiftKey && !mod && event.code === "Digit1") {
        engine.fit();
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "c") {
        const json = engine.copySelection();
        if (json) navigator.clipboard?.writeText(json).catch(() => undefined);
        event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "x") {
        const json = engine.cutSelection();
        if (json) navigator.clipboard?.writeText(json).catch(() => undefined);
        event.preventDefault();
        return;
      }
      // ⌘V is deliberately NOT handled here — the native paste event carries the
      // clipboard payload and fires right after; handling both would paste twice.
      if (event.metaKey || event.ctrlKey || event.altKey) return; // leave chords alone
      if (event.key === "Enter") {
        if (engine.editSelectedText()) event.preventDefault();
        return;
      }
      // ⇧H/⇧V flip the selection; with nothing selected they fall through to the
      // tool hotkeys (plain H is the hand tool).
      if (event.shiftKey && engine.getSelection().length > 0) {
        const key = event.key.toLowerCase();
        if (key === "h" || key === "v") {
          engine.flipSelection(key === "h" ? "horizontal" : "vertical");
          event.preventDefault();
          return;
        }
      }
      if (event.key.toLowerCase() === "q") {
        engine.setToolLocked(!engine.getToolLocked());
        toolLockCbRef.current?.(engine.getToolLocked());
        event.preventDefault();
        return;
      }
      const tool = toolForKey(event.key);
      if (tool) {
        engine.setTool(tool);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") spaceHeld = false;
    };

    // Paste rides the native event (no clipboard-read permission needed); foreign
    // payloads fall back to the engine's internal buffer.
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!engine.pasteJson(text || null)) engine.pasteJson(null);
      event.preventDefault();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("contextmenu", onContext);
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("keyup", onKeyUp);
    container.addEventListener("paste", onPaste);

    // Debug/e2e seam (same idiom as the app's __playgroundUserStore): the last
    // mounted engine is reachable from the console and from Playwright evaluate.
    (globalThis as unknown as { __osioDrawEngine?: DrawEngine }).__osioDrawEngine = engine;

    onReady?.(engine);
    return () => {
      clearPendingMove();
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("contextmenu", onContext);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("paste", onPaste);
      engine.destroy();
      // Unhook the debug seam, or it pins the destroyed engine (scene, history
      // snapshots, canvas backing store) for the rest of the session. Guarded:
      // another mount may already have claimed the global.
      const debugHost = globalThis as unknown as { __osioDrawEngine?: DrawEngine };
      if (debugHost.__osioDrawEngine === engine) delete debugHost.__osioDrawEngine;
      engineRef.current = null;
    };
    // Engine is created once for the lifetime of the mount; prop syncs live in
    // the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scene) engineRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (defaultStroke) engineRef.current?.setNextStyle({ strokeColor: defaultStroke });
  }, [defaultStroke]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      style={{ position: "relative", width: "100%", height: "100%", touchAction: "none", outline: "none" }}
    >
      <canvas ref={canvasRef} aria-hidden="true" tabIndex={-1} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
