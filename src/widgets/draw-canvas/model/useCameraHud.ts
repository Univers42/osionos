/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCameraHud.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera, DrawEngine } from "@osionos/draw-engine";

export interface CameraHud {
  /** Camera scale as an integer percentage (100 = 1:1). */
  zoom: number;
  /** False when a non-empty scene is entirely off-screen ("back to content"). */
  contentVisible: boolean;
  /** Wire to DrawCanvas's onCameraChange. */
  onCameraChange: (camera: Camera) => void;
}

/** Camera-driven HUD state (zoom % + content visibility), coalesced to one state
 *  flush per animation frame. The engine fires onCameraChange synchronously per
 *  wheel tick / pan event, and `contentInView()` walks the whole scene — doing
 *  that (plus a host re-render) per event burnt frame budget on chrome that can
 *  only be seen once per painted frame. Shared by the full-page Draw surface and
 *  the embedded `draw` block. */
export function useCameraHud(engine: DrawEngine | null): CameraHud {
  const [zoom, setZoom] = useState(100);
  const [contentVisible, setContentVisible] = useState(true);
  // Latched so the rAF callback reads the live engine, never a stale closure.
  // Written in an effect (not during render) per react-hooks/refs; the rAF is
  // scheduled from an event, always after commit, so it sees the latest engine.
  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  const rafRef = useRef(0);
  const pendingRef = useRef<Camera | null>(null);

  const onCameraChange = useCallback((camera: Camera) => {
    pendingRef.current = camera;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const latest = pendingRef.current;
      pendingRef.current = null;
      if (!latest) return;
      setZoom(Math.round(latest.scale * 100));
      setContentVisible(engineRef.current?.contentInView() ?? true);
    });
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return { zoom, contentVisible, onCameraChange };
}
