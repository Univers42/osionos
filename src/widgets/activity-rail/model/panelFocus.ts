/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   panelFocus.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:15:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:15:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUIStore, type ActivePanel } from "@/shared/config/uiStore";

/** Opens `panel` (docking the sidebar if it was hidden) and moves keyboard focus
 *  into it, so a shortcut lands where the user can type or arrow at once. */
export function openAndFocusPanel(panel: ActivePanel): void {
  const ui = useUIStore.getState();
  if (ui.sidebarMode === "hidden") ui.toggleDocked();
  ui.expandToPanel(panel);
  focusWhenReady(panel, FOCUS_ATTEMPTS);
}

/** Ponytail: a panel opened for the first time is a lazy chunk, so its first
 *  focusable may not exist yet; this looks again each frame and gives up after
 *  about two seconds (a slow network), leaving the panel open but unfocused. */
const FOCUS_ATTEMPTS = 120;

function focusWhenReady(panel: ActivePanel, attemptsLeft: number): void {
  requestAnimationFrame(() => {
    const root = document.querySelector<HTMLElement>(`[data-sidebar-panel="${panel}"]:not([hidden])`);
    const target = root?.querySelector<HTMLElement>("input, [tabindex]:not([tabindex='-1']), button, a[href]");
    if (target) target.focus();
    else if (attemptsLeft > 0) focusWhenReady(panel, attemptsLeft - 1);
  });
}
