/**
 * Overview navigator: draws every (sampled) visible node as a dot in a small
 * canvas and overlays the current viewport rectangle; click/drag recenters the
 * main camera. Reads a one-shot snapshot from the engine each (throttled) frame,
 * so it stays cheap regardless of graph size. CSS-class sized (no inline styles).
 */

import { type ReactElement, useEffect, useRef } from "react";
import type { GraphEngine } from "../core/engine";
import { fitBounds, visibleWorldRect } from "../core/camera/controls";
import { screenToWorld, worldToScreen } from "../core/camera/transform";

const MINI_W = 184;
const MINI_H = 120;
const PAD = 6;
const FRAME_MS = 66; // ~15fps is plenty for an overview
const MAX_DOTS = 2000;

export function Minimap({ engine }: { engine: GraphEngine | null }): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!engine || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(MINI_W * dpr);
    canvas.height = Math.round(MINI_H * dpr);

    let raf = 0;
    let last = 0;
    let lastSignature = "";
    const draw = (time: number): void => {
      raf = requestAnimationFrame(draw);
      if (time - last < FRAME_MS) return;
      last = time;
      // A settled graph with a parked camera polls to the same signature — skip
      // the snapshot + clear + per-dot redraw entirely until something moves.
      const signature = engine.getMinimapSignature();
      if (signature === lastSignature) return;
      lastSignature = signature;
      const data = engine.getMinimapData();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MINI_W, MINI_H);
      if (!data.bounds || data.count === 0) return;
      const cam = fitBounds(data.bounds, MINI_W, MINI_H, PAD);
      const stride = Math.max(1, Math.ceil(data.count / MAX_DOTS));
      ctx.fillStyle = "rgba(229, 231, 245, 0.6)";
      for (let i = 0; i < data.count; i += stride) {
        if (data.visible[i] === 0) continue;
        // Inlined world→screen: an object per dot (up to MAX_DOTS/frame) is pure GC churn.
        ctx.fillRect(data.x[i] * cam.scale + cam.x, data.y[i] * cam.scale + cam.y, 1.4, 1.4);
      }
      const rect = visibleWorldRect(data.camera, data.width, data.height);
      const topLeft = worldToScreen(cam, rect.minX, rect.minY);
      const bottomRight = worldToScreen(cam, rect.maxX, rect.maxY);
      ctx.strokeStyle = "rgba(165, 180, 252, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    };
    raf = requestAnimationFrame(draw);

    const recenter = (event: PointerEvent): void => {
      const data = engine.getMinimapData();
      if (!data.bounds) return;
      const rect = canvas.getBoundingClientRect();
      const cam = fitBounds(data.bounds, MINI_W, MINI_H, PAD);
      const world = screenToWorld(cam, event.clientX - rect.left, event.clientY - rect.top);
      engine.centerOnWorld(world.x, world.y);
    };
    let dragging = false;
    const onDown = (event: PointerEvent): void => {
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      recenter(event);
    };
    const onMove = (event: PointerEvent): void => {
      if (dragging) recenter(event);
    };
    const onUp = (event: PointerEvent): void => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [engine]);

  return <canvas ref={ref} className="osio-graph-minimap" aria-label="Graph minimap" />;
}
