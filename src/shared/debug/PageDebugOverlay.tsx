/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageDebugOverlay.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * JS-backed page debug tools (lazy chunk — mounted only while one is enabled):
 * overflow scanner, hover ruler, caret inspector. Fixed HUD chips, monospace,
 * pointer-events: none — they observe, never intercept.
 */

import React, { useEffect, useState } from "react";
import { anyJsDebugToolEnabled, usePageDebugStore } from "./pageDebugStore";

const CHIP: React.CSSProperties = {
  position: "fixed",
  zIndex: 2000,
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(17, 17, 27, 0.92)",
  color: "#67e8f9",
  font: "11px/16px ui-monospace, monospace",
  pointerEvents: "none",
  maxWidth: 420,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const SCAN_TARGETS = "[data-block-id], .osionos-layout-cell";

function scanOverflow() {
  for (const el of document.querySelectorAll<HTMLElement>(SCAN_TARGETS)) {
    const overflowing =
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (overflowing) el.setAttribute("data-debug-overflowing", "");
    else el.removeAttribute("data-debug-overflowing");
  }
}

function clearOverflowMarks() {
  for (const el of document.querySelectorAll("[data-debug-overflowing]"))
    el.removeAttribute("data-debug-overflowing");
}

function useOverflowScanner(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = globalThis.setTimeout(() => { timer = null; scanOverflow(); }, 600);
    };
    scanOverflow();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    globalThis.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", schedule);
      if (timer !== null) globalThis.clearTimeout(timer);
      clearOverflowMarks();
    };
  }, [active]);
}

function useHoverRuler(active: boolean): string | null {
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return; // stale value is render-gated by the caller
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(SCAN_TARGETS);
        if (!target) { setInfo(null); return; }
        const rect = target.getBoundingClientRect();
        const kind = target.getAttribute("data-block-type") ?? (target.className.includes("layout-cell") ? "cell" : "block");
        setInfo(`${kind} · ${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active]);
  return info;
}

function useCaretInspector(active: boolean): string | null {
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return; // stale value is render-gated by the caller
    const onSelection = () => {
      const selection = document.getSelection();
      if (!selection?.anchorNode) { setInfo(null); return; }
      const anchor = selection.anchorNode;
      const element = anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement;
      const block = element?.closest("[data-block-id]");
      if (!block) { setInfo(null); return; }
      const type = block.getAttribute("data-block-type") ?? "?";
      const id = block.getAttribute("data-block-id") ?? "?";
      setInfo(`caret · ${type} · ${id} · offset ${selection.anchorOffset}${selection.isCollapsed ? "" : ` → ${selection.focusOffset}`}`);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [active]);
  return info;
}

const PageDebugOverlay: React.FC = () => {
  const enabled = usePageDebugStore((s) => s.enabled);
  useOverflowScanner(!!enabled.overflow);
  const ruler = useHoverRuler(!!enabled.measure);
  const caret = useCaretInspector(!!enabled.caret);

  if (!anyJsDebugToolEnabled(enabled)) return null;
  return (
    <>
      {enabled.measure && ruler && (
        <div data-testid="debug-ruler-chip" style={{ ...CHIP, right: 12, bottom: 12 }}>{ruler}</div>
      )}
      {enabled.caret && caret && (
        <div data-testid="debug-caret-chip" style={{ ...CHIP, left: 12, bottom: 12 }}>{caret}</div>
      )}
    </>
  );
};

export default PageDebugOverlay;
