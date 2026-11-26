/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dockSplitterClasses.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DockPosition } from "@/widgets/workbench/model/workbenchLayout";

/** The splitter's classes per dock position, as whole literals so Tailwind sees every class.
 *  Bottom is a horizontal bar pulled up over the grid's bottom gutter; right and left are vertical
 *  bars pulled over the grid's gutter on their side. Each is the frame gap wide (or tall), with a
 *  hit area never under --osio-splitter-hit-min (::before) and the hairline (::after). */
export const SPLITTER_CLASS: Readonly<Record<DockPosition, string>> = Object.freeze({
  bottom: [
    "relative z-20 mx-[var(--osio-frame-gap)] -mt-[var(--osio-frame-gap)] h-[var(--osio-frame-gap)] shrink-0 cursor-row-resize touch-none bg-transparent",
    "before:absolute before:inset-x-0 before:top-1/2 before:h-[max(100%,var(--osio-splitter-hit-min))] before:-translate-y-1/2",
    "after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-[var(--osio-pane-seam)] after:transition-colors after:duration-(--osio-dur-fast)",
    "hover:after:bg-[var(--osio-accent)]/60 active:after:bg-[var(--osio-accent)] focus-visible:after:h-[var(--osio-focus-ring-width)] focus-visible:after:bg-[var(--osio-accent)]",
  ].join(" "),
  right: [
    "relative z-20 my-[var(--osio-frame-gap)] -ml-[var(--osio-frame-gap)] w-[var(--osio-frame-gap)] shrink-0 self-stretch cursor-col-resize touch-none bg-transparent",
    "before:absolute before:inset-y-0 before:left-1/2 before:w-[max(100%,var(--osio-splitter-hit-min))] before:-translate-x-1/2",
    "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-[var(--osio-pane-seam)] after:transition-colors after:duration-(--osio-dur-fast)",
    "hover:after:bg-[var(--osio-accent)]/60 active:after:bg-[var(--osio-accent)] focus-visible:after:w-[var(--osio-focus-ring-width)] focus-visible:after:bg-[var(--osio-accent)]",
  ].join(" "),
  left: [
    "relative z-20 my-[var(--osio-frame-gap)] -mr-[var(--osio-frame-gap)] w-[var(--osio-frame-gap)] shrink-0 self-stretch cursor-col-resize touch-none bg-transparent",
    "before:absolute before:inset-y-0 before:left-1/2 before:w-[max(100%,var(--osio-splitter-hit-min))] before:-translate-x-1/2",
    "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-[var(--osio-pane-seam)] after:transition-colors after:duration-(--osio-dur-fast)",
    "hover:after:bg-[var(--osio-accent)]/60 active:after:bg-[var(--osio-accent)] focus-visible:after:w-[var(--osio-focus-ring-width)] focus-visible:after:bg-[var(--osio-accent)]",
  ].join(" "),
});
