/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePhoneDrawer.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import { useMediaQuery } from "@/shared/config/useMediaQuery";
import { PHONE_QUERY } from "@/shared/config/useResponsiveSidebar";

const TAB_STOPS = "a[href],button,input,select,textarea,[tabindex]";

/** The elements Tab can reach inside `root`: enabled, tabbable and laid out (a `hidden` panel has no boxes). */
function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TAB_STOPS)].filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.getClientRects().length > 0,
  );
}

/** Wraps Tab and Shift+Tab inside `root`; true when it moved focus. */
function wrapTab(event: KeyboardEvent<HTMLElement>, root: HTMLElement, panel: HTMLElement | null): boolean {
  const stops = tabStops(root);
  const first = stops[0];
  const last = stops.at(-1);
  const current = document.activeElement;
  const leavesStart = event.shiftKey && (current === first || current === panel);
  const leavesEnd = !event.shiftKey && current === last;
  if (!first || !last || !(leavesStart || leavesEnd)) return false;
  (leavesStart ? last : first).focus();
  return true;
}

/**
 * Focus handling for the phone drawer (the sidebar panel opened over the page).
 * Opening moves focus into the panel and remembers the element that had it; Tab stays inside the
 * sidebar (rail and panel); Escape or `closeAndRestore` fold it and hand focus back to the opener,
 * or to the selected rail tab when the opener was not a focusable element. Inert off a phone.
 * `asideRef` and `panelRef` are the sidebar and the panel card it opens; returns the key handler for the sidebar and `closeAndRestore`.
 */
export function usePhoneDrawer(asideRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, open: boolean, fold: () => void) {
  const openerRef = useRef<HTMLElement | null>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const active = open && phone;

  useEffect(() => {
    if (!active) return;
    const held = document.activeElement;
    openerRef.current = held instanceof HTMLElement && held !== document.body ? held : null;
    if (!panelRef.current?.contains(held)) panelRef.current?.focus();
  }, [active, panelRef]);

  const closeAndRestore = () => {
    fold();
    const opener = openerRef.current ?? asideRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    opener?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!active || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestore();
    } else if (event.key === "Tab" && wrapTab(event, event.currentTarget, panelRef.current)) {
      event.preventDefault();
    }
  };

  return { asideRef, panelRef, onKeyDown, closeAndRestore };
}
