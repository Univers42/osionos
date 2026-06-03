/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Minimap.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";

import { fitBounds, screenToWorld, visibleWorldRect, worldToScreen } from "../render/camera";
import type { CanvasScene } from "../render/CanvasScene";

/**
 * Overview navigator (doc 05 §5). Draws every (visible) node as a dot in a small
 * canvas and overlays the current viewport rectangle; click/drag to recenter the
 * main camera. It reuses `camera.ts` for the world→mini transform (the minimap
 * is just `fitBounds` into a tiny viewport), runs its own throttled rAF, and
 * samples nodes so the overview stays cheap regardless of graph size.
 */

const MINI_W = 184;
const MINI_H = 120;
const PAD = 6;
const FRAME_MS = 66; // ~15fps is plenty for an overview
const MAX_DOTS = 2000;

export const Minimap: React.FC<{ scene: CanvasScene | null }> = ({ scene }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!scene || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(MINI_W * dpr);
    canvas.height = Math.round(MINI_H * dpr);

    let raf = 0;
    let last = 0;
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (time - last < FRAME_MS) return;
      last = time;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MINI_W, MINI_H);

      const bounds = scene.worldBounds();
      const { x, y, count, visible } = scene.getPositionsRef();
      if (!bounds || count === 0) return;

      const cam = fitBounds(bounds, MINI_W, MINI_H, PAD);
      const stride = Math.max(1, Math.ceil(count / MAX_DOTS));
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (let i = 0; i < count; i += stride) {
        if (visible[i] === 0) continue;
        const point = worldToScreen(cam, x[i], y[i]);
        ctx.fillRect(point.x, point.y, 1.4, 1.4);
      }

      const viewport = scene.getViewportSize();
      const rect = visibleWorldRect(scene.getCamera(), viewport.width, viewport.height);
      const topLeft = worldToScreen(cam, rect.minX, rect.minY);
      const bottomRight = worldToScreen(cam, rect.maxX, rect.maxY);
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    };
    raf = requestAnimationFrame(draw);

    const recenter = (event: PointerEvent) => {
      const bounds = scene.worldBounds();
      if (!bounds) return;
      const rect = canvas.getBoundingClientRect();
      const cam = fitBounds(bounds, MINI_W, MINI_H, PAD);
      const world = screenToWorld(cam, event.clientX - rect.left, event.clientY - rect.top);
      scene.centerOnWorld(world.x, world.y);
    };
    let dragging = false;
    const onDown = (event: PointerEvent) => { dragging = true; canvas.setPointerCapture(event.pointerId); recenter(event); };
    const onMove = (event: PointerEvent) => { if (dragging) recenter(event); };
    const onUp = (event: PointerEvent) => {
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
  }, [scene]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: MINI_W, height: MINI_H }}
      className="cursor-pointer rounded-lg border border-white/15 bg-black/40 backdrop-blur"
      aria-label="Graph minimap"
    />
  );
};
