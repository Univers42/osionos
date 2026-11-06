/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   startPaneDrag.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/06 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/06 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";
import { ratioFromX } from "../model/rawModeLayout";

/** Drags a vertical pane divider: reports the pointer's ratio across `container` until release. */
export function startPaneDrag(event: React.PointerEvent, container: HTMLElement | null, onRatio: (ratio: number) => void): void {
  event.preventDefault();
  const rect = container?.getBoundingClientRect();
  if (!rect) return;
  const move = (moveEvent: PointerEvent) => onRatio(ratioFromX(moveEvent.clientX, rect));
  const up = () => { globalThis.removeEventListener("pointermove", move); document.body.style.userSelect = ""; };
  document.body.style.userSelect = "none";
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", up, { once: true });
}
