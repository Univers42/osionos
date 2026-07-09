/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useResponsiveSidebar.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useRef } from "react";

import { useUIStore } from "./uiStore";

/** Below this width the 260px pushing panel squeezes content to a sliver, so we
 *  fall back to the icon rail. Matches Tailwind's `md` breakpoint. */
const MOBILE_MAX = 767;

/**
 * Keep the pushing sidebar usable on narrow viewports. When the viewport crosses
 * into mobile the expanded panel collapses to the icon rail (content reclaims the
 * width); when it grows back we restore the panel — but ONLY if we were the ones
 * who collapsed it, so a user who deliberately keeps the rail is never overridden.
 * Fires on breakpoint crossings only (matchMedia), never on every resize tick.
 */
export function useResponsiveSidebar(): void {
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);

    const apply = (mobile: boolean) => {
      const { sidebarMode, collapseToRail, expandToPanel } = useUIStore.getState();
      if (mobile) {
        if (sidebarMode === "panel") {
          collapseToRail();
          autoCollapsedRef.current = true;
        }
      } else if (autoCollapsedRef.current) {
        autoCollapsedRef.current = false;
        if (sidebarMode === "rail") expandToPanel();
      }
    };

    apply(mql.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
}
