/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuPlacement.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// Where the slash menu and its preview pane sit around the caret. Pure, so the
// placement maths is tested without a browser.

import type { CSSProperties } from "react";

const MENU_MARGIN = 8;
const MENU_GAP = 6;
const COMMAND_MENU_WIDTH = 324;
const COMMAND_MENU_MAX_HEIGHT = 448;
export const PREVIEW_WIDTH = 280;

export interface SlashCaret {
  x: number;
  y: number;
  top: number;
}

export interface SlashMenuPlacement {
  menu: CSSProperties;
  /** Null when neither side of the menu has room (a phone): the menu shows alone. */
  preview: CSSProperties | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** The preview hangs beside the menu: right when it fits, else left, else nowhere. */
function previewLeft(menuLeft: number, menuWidth: number, viewportWidth: number): number | null {
  const right = menuLeft + menuWidth + MENU_GAP;
  if (right + PREVIEW_WIDTH + MENU_MARGIN <= viewportWidth) return right;
  const left = menuLeft - MENU_GAP - PREVIEW_WIDTH;
  return left >= MENU_MARGIN ? left : null;
}

export function placeSlashMenu(caret: SlashCaret, viewportWidth: number, viewportHeight: number): SlashMenuPlacement {
  // The panel is 324px wide but never wider than the viewport minus its margin,
  // and at most 40vh tall (448px cap) — the placement maths uses the real size.
  const menuWidth = Math.min(COMMAND_MENU_WIDTH, viewportWidth - MENU_MARGIN * 2);
  const menuHeight = Math.min(COMMAND_MENU_MAX_HEIGHT, viewportHeight * 0.4);
  const left = clamp(caret.x, MENU_MARGIN, viewportWidth - menuWidth - MENU_MARGIN);

  const spaceAbove = caret.top - MENU_GAP - MENU_MARGIN;
  const spaceBelow = viewportHeight - caret.y - MENU_GAP - MENU_MARGIN;
  // The panel is content-sized and filters while the user types, so its TOP edge
  // is the only edge that may be a fixed coordinate: pinned by its bottom, every
  // filter step moved the rows under the pointer and a miss closed the menu
  // (#330). Below the caret when the full panel fits, so it sits flush with no
  // gap at any row count; otherwise on the roomier side, with `top` computed from
  // the full height. Caveat: above the caret, a short list leaves a gap between
  // its bottom and the caret, up to the height of the full panel.
  const placeBelow = spaceBelow >= menuHeight || spaceBelow > spaceAbove;
  const maxHeight = Math.min(menuHeight, placeBelow ? spaceBelow : spaceAbove);
  // The preview shares the menu's top edge, so both stay put together.
  const vertical: CSSProperties = {
    top: placeBelow ? caret.y + MENU_GAP : caret.top - MENU_GAP - maxHeight,
    maxHeight,
  };

  const sideLeft = previewLeft(left, menuWidth, viewportWidth);
  return {
    menu: { left, ...vertical },
    preview: sideLeft === null ? null : { left: sideLeft, ...vertical },
  };
}
