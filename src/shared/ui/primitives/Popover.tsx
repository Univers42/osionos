/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Popover.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cx } from "../shared/classNames";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { clampTriggerAlignedMenuPosition } from "../hooks/viewportPosition";

/**
 * Popover — thin portaled popover positioned against an anchor element.
 * Props:
 *   anchorRef: React.RefObject<HTMLElement>   the element to align under
 *   open: boolean                              visibility
 *   onClose: () => void                        called on Escape / outside click
 *   align?: "start" | "end"                    (default "start")
 *   className?: string
 *   children: React.ReactNode
 * Surface chrome matches Menu (elevated bg, 1px border, rounded-lg, shadow-menu).
 */
export interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}

export const Popover: React.FC<PopoverProps> = ({ anchorRef, open, onClose, align = "start", className, children }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useEscapeKey(onClose, open);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      const pos = clampTriggerAlignedMenuPosition(a, { width: panel.offsetWidth, height: panel.offsetHeight }, { align });
      setStyle({ position: "fixed", top: pos.top, left: pos.left, opacity: 1, zIndex: 10003 });
    };
    const frame = requestAnimationFrame(place);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    globalThis.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      globalThis.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [align, anchorRef, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={cx(
        "rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-1 shadow-[var(--osio-shadow-menu)] outline-none",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
};
