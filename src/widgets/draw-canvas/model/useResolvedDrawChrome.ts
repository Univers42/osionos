/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useResolvedDrawChrome.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";
import { type DrawTheme, LIGHT_THEME } from "@osionos/draw-engine";

import { APPEARANCE_ATTRIBUTES } from "@/shared/config/theme";

export interface DrawChrome {
  theme: DrawTheme;
  /** Default stroke for new shapes — a theme token so ink is visible on any canvas. */
  ink: string;
}

/** Resolve the engine's chrome + ink from the host's design tokens, re-resolving
 *  when the theme or palette attribute flips (the engine stays token-agnostic).
 *  Shared by the full-page Draw surface and the embedded `draw` block. */
export function useResolvedDrawChrome(): DrawChrome {
  const [chrome, setChrome] = useState<DrawChrome>({ theme: LIGHT_THEME, ink: "#1e1e1e" });
  useEffect(() => {
    const resolve = () => {
      const style = getComputedStyle(document.documentElement);
      // The canvas is a REAL surface, not a hole in the page: painted the page's
      // colour it read as transparent, with no sense of a canvas at all. A page is
      // the pane's card (--osio-bg-surface), so the canvas is an inset in it.
      const background = style.getPropertyValue("--osio-bg-subtle").trim();
      const grid = style.getPropertyValue("--osio-border-soft").trim();
      const accent = style.getPropertyValue("--osio-accent").trim();
      const ink = style.getPropertyValue("--osio-fg-default").trim();
      setChrome({
        theme: {
          background: background || LIGHT_THEME.background,
          grid: grid || LIGHT_THEME.grid,
          accent: accent || LIGHT_THEME.accent,
        },
        ink: ink || "#1e1e1e",
      });
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette", "class", ...APPEARANCE_ATTRIBUTES],
    });
    return () => observer.disconnect();
  }, []);
  return chrome;
}
