/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ColorMenu.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ColorSwatches } from "@/shared/ui/molecules/IconPicker/ColorSwatches";

const MENU_MARGIN = 8;
const MENU_GAP = 6;
const MENU_WIDTH = 288;
const MENU_MAX_HEIGHT = 160;

interface ColorMenuProps {
  position: { x: number; y: number; top: number };
  onPick: (color: string) => void;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export const ColorMenu: React.FC<ColorMenuProps> = ({ position, onPick, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey, true);
    globalThis.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      globalThis.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const menuStyle = useMemo<React.CSSProperties>(() => {
    const vw = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1024;
    const vh = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 768;
    const belowTop = position.y + MENU_GAP;
    const aboveTop = position.top - MENU_GAP - MENU_MAX_HEIGHT;
    const overflowsBelow = belowTop + MENU_MAX_HEIGHT > vh - MENU_MARGIN;
    const top = overflowsBelow && aboveTop >= MENU_MARGIN
      ? aboveTop
      : clamp(belowTop, MENU_MARGIN, vh - MENU_MAX_HEIGHT - MENU_MARGIN);
    return {
      top,
      left: clamp(position.x, MENU_MARGIN, vw - MENU_WIDTH - MENU_MARGIN),
    };
  }, [position.x, position.y, position.top]);

  if (typeof document === "undefined") return null;

  // Portal to <body> so `position: fixed` resolves against the viewport, matching
  // the slash / page-selector popovers. Picking a swatch colors the text that
  // follows; the "Default" reset closes without applying a color.
  return createPortal(
    <div
      ref={ref}
      data-testid="color-menu"
      className="fixed z-[var(--osio-z-popover)] w-72 overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-2xl"
      style={menuStyle}
    >
      <ColorSwatches onChange={(color) => (color ? onPick(color) : onClose())} />
    </div>,
    document.body,
  );
};
