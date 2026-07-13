/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   drawHandoff.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Binds the full-page Draw tab to the `draw` BLOCK that opened it.
 *
 * The Draw tab is a singleton (`DRAW_TAB_ID`) with no page of its own, so it has
 * nowhere to save. When "expand" is pressed on a draw block we bind the tab to
 * that block: the full app hydrates from it and writes edits straight back, so
 * the round-trip persists through the ordinary page-save path.
 *
 * A blank "New drawing" (View menu) clears the binding — that drawing is
 * scratch until standalone draw-document persistence lands.
 */

export interface DrawBinding {
  pageId: string;
  blockId: string;
  content: string;
}

let binding: DrawBinding | null = null;

/** Bind the Draw tab to a block (called by the block's expand button). */
export function setDrawBinding(next: DrawBinding): void {
  binding = next;
}

/** The block the Draw tab is currently bound to, if any. Non-consuming: the tab
 *  can unmount/remount (pane switch) and stay bound. */
export function getDrawBinding(): DrawBinding | null {
  return binding;
}

/** Unbind — a fresh scratch drawing. */
export function clearDrawBinding(): void {
  binding = null;
}
