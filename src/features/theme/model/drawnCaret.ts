/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawnCaret.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 23:30:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The caret the app draws when the person picks a shape or a steady caret. Firefox 148 parses
// neither caret-shape nor caret-animation and no browser sets a caret's width, so a choice
// made in CSS reached only Chromium. Here the native caret of a focused contenteditable is
// made transparent and one fixed element is moved onto the collapsed selection each frame
// the selection, the text or a scroll changes it. At the default (a blinking bar) nothing is
// drawn and no listener runs. Inputs and textareas keep their native caret: a selection
// inside one has no client rect to measure.
// Caveat: at a soft-wrap boundary the caret is drawn on the lower line, where Chromium and
// Firefox put a caret typed there; a caret placed by clicking the end of the upper line is
// drawn one line low. When nothing can be measured the native caret is shown instead.

import { caretRect } from "@/features/block-editor/model/caretGeometry";
import { readCurrentAppearance, subscribeAppearance, type Appearance, type CaretShape } from "@/shared/config/theme";
import { toOnScreenPx } from "@/shared/lib/dom/cssZoom";

export interface CaretBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const THICK_BAR_PX = 3;
const UNDERLINE_PX = 2;

/** Whether the native caret can show the choice: only the default blinking thin bar. */
export function needsDrawnCaret(appearance: Pick<Appearance, "caretShape" | "caretBlink">): boolean {
  return appearance.caretShape !== "bar" || appearance.caretBlink !== "on";
}

/** The drawn caret's box, in viewport px, for the caret's line rect and the next character's width. */
export function caretBox(line: { left: number; top: number; height: number }, shape: CaretShape, charWidth: number): CaretBox {
  if (shape === "block") return { x: line.left, y: line.top, width: charWidth, height: line.height };
  if (shape === "underscore") return { x: line.left, y: line.top + line.height - UNDERLINE_PX, width: charWidth, height: UNDERLINE_PX };
  const width = shape === "thick" ? THICK_BAR_PX : 1;
  return { x: line.left - width / 2, y: line.top, width, height: line.height };
}

function focusedEditable(selection: Selection): HTMLElement | null {
  const node = selection.anchorNode;
  const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const editable = element?.closest<HTMLElement>('[contenteditable="true"]');
  return editable && editable.contains(document.activeElement) ? editable : null;
}

// The character after the caret sets a block's width; at a line end there is none, so the
// width of an "n" in the editable's font stands in (0.55em, close for the UI sans).
function nextCharWidth(range: Range, editable: HTMLElement): number {
  const { startContainer: node, startOffset: offset } = range;
  if (node.nodeType === Node.TEXT_NODE && offset < (node as Text).data.length) {
    const probe = document.createRange();
    probe.setStart(node, offset);
    probe.setEnd(node, offset + 1);
    const width = probe.getBoundingClientRect().width;
    if (width > 1) return width;
  }
  return toOnScreenPx(Number.parseFloat(getComputedStyle(editable).fontSize) * 0.55, editable);
}

// An empty line has no text rect, only its element's box: the caret sits at its content edge.
function lineOf(range: Range, rect: DOMRect): { left: number; top: number; height: number } {
  const node = range.startContainer;
  if (node.nodeType !== Node.ELEMENT_NODE || range.getClientRects().length > 0) return rect;
  const style = getComputedStyle(node as Element);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
  const zoomed = (px: string) => toOnScreenPx(Number.parseFloat(px) || 0, node as Element);
  return {
    left: rect.left + zoomed(style.borderLeftWidth) + zoomed(style.paddingLeft),
    top: rect.top + zoomed(style.borderTopWidth) + zoomed(style.paddingTop),
    height: Math.min(rect.height, toOnScreenPx(lineHeight, node as Element)),
  };
}

function createCaretElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "osio-drawn-caret";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  document.body.append(element);
  return element;
}

/** Draws the caret while the stored appearance asks for it. Call once at boot; returns the stop. */
export function startDrawnCaret(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const caret = createCaretElement();
  let frame = 0;
  let nativeFallback: HTMLElement | null = null;
  let active = false;

  const showNative = (editable: HTMLElement | null) => {
    if (nativeFallback === editable) return;
    nativeFallback?.removeAttribute("data-native-caret");
    editable?.setAttribute("data-native-caret", "");
    nativeFallback = editable;
  };

  const draw = () => {
    frame = 0;
    const selection = document.getSelection();
    const editable = selection && selection.rangeCount > 0 && selection.isCollapsed ? focusedEditable(selection) : null;
    if (!selection || !editable || !document.hasFocus()) {
      caret.hidden = true;
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = caretRect(range, "last");
    if (!rect) {
      caret.hidden = true;
      showNative(editable);
      return;
    }
    showNative(null);
    const shape = readCurrentAppearance().caretShape;
    const charWidth = shape === "block" || shape === "underscore" ? nextCharWidth(range, editable) : 0;
    const box = caretBox(lineOf(range, rect), shape, charWidth);
    caret.style.transform = `translate(${box.x}px, ${box.y}px)`;
    caret.style.width = `${box.width}px`;
    caret.style.height = `${box.height}px`;
    caret.hidden = false;
    // A moving caret is solid, as the native one is: the blink restarts on every move.
    for (const animation of caret.getAnimations()) animation.currentTime = 0;
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const events: [EventTarget, string][] = [
    [document, "selectionchange"],
    [document, "input"],
    [document, "focusin"],
    [document, "focusout"],
    [document, "scroll"],
    [globalThis, "resize"],
    [globalThis, "focus"],
    [globalThis, "blur"],
  ];

  const sync = () => {
    const wanted = needsDrawnCaret(readCurrentAppearance());
    if (wanted === active) {
      if (active) schedule();
      return;
    }
    active = wanted;
    for (const [target, type] of events) {
      if (wanted) target.addEventListener(type, schedule, { capture: true, passive: true });
      else target.removeEventListener(type, schedule, { capture: true });
    }
    document.documentElement.toggleAttribute("data-caret-drawn", wanted);
    if (wanted) schedule();
    else {
      caret.hidden = true;
      showNative(null);
    }
  };

  sync();
  const unsubscribe = subscribeAppearance(sync);
  return () => {
    unsubscribe();
    if (active) {
      active = false;
      for (const [target, type] of events) target.removeEventListener(type, schedule, { capture: true });
      document.documentElement.removeAttribute("data-caret-drawn");
    }
    if (frame) cancelAnimationFrame(frame);
    showNative(null);
    caret.remove();
  };
}
