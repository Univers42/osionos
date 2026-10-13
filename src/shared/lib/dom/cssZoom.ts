/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cssZoom.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 03:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 03:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A pane can be zoomed (widgets/workspace-grid/model/paneZoom.ts). Inside it the
// DOM reports lengths in two units, measured on Chromium 149:
//   on-screen px — getBoundingClientRect, clientX/Y, offsetX/Y, elementFromPoint
//   CSS px       — offsetWidth/Top, clientWidth, scrollTop, getComputedStyle,
//                  ResizeObserver sizes, and every length written to `style`
// Adding one to the other is off by the zoom factor. Any gesture that turns a
// pointer distance or a rect into a style value converts through this file.

interface ZoomAware {
  readonly currentCSSZoom: number;
}

function isZoomAware(element: object): element is ZoomAware {
  return "currentCSSZoom" in element && typeof element.currentCSSZoom === "number";
}

/** Whether this browser reports an element's zoom. It arrived together with the
 *  two-unit behaviour above, so a browser without it gets no pane zoom at all
 *  rather than one whose rects follow older rules. */
export function supportsCssZoom(): boolean {
  return typeof Element !== "undefined" && "currentCSSZoom" in Element.prototype;
}

/** On-screen px per CSS px inside `element`: its pane's zoom, 1 anywhere else. */
export function cssZoomOf(element: Element | null | undefined): number {
  if (!element || !isZoomAware(element) || !(element.currentCSSZoom > 0)) return 1;
  return element.currentCSSZoom;
}

/** An on-screen length (a rect size, a pointer distance) as CSS px of `element`. */
export function toCssPx(onScreenPx: number, element: Element | null | undefined): number {
  return onScreenPx / cssZoomOf(element);
}

/** A CSS-px length of `element` (a scrollTop, an offsetHeight) as on-screen px. */
export function toOnScreenPx(cssPx: number, element: Element | null | undefined): number {
  return cssPx * cssZoomOf(element);
}
