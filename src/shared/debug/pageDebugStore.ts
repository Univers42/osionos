/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageDebugStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Page debug tools (··· menu → Tools). Each tool toggles independently and
 * costs nothing while off: CSS tools become `data-debug-*` attributes on the
 * page root (rules in app/styles/debug-tools.css match only then); JS tools
 * lazy-mount one overlay component. Persisted so a debugging session survives
 * reloads; global (not per page) — debugging is a session activity.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PageDebugToolId =
  | "outlines" // hue-coded outlines: blocks / cells / columns / page regions
  | "surfaces" // translucent fill stacking with nesting depth (contrast mode)
  | "grid" // 8px baseline grid over the body (spacing rhythm)
  | "blockInfo" // hover badge: block type + id (innermost block only)
  | "overflow" // JS scan: flag containers whose content overflows their box
  | "measure" // JS: live W×H ruler chip for the hovered block/cell
  | "caret" // JS: live caret block id + offset readout
  | "perf"; // passthrough to the existing osio:perf profiler harness

/** Tools that need the lazy JS overlay mounted (the rest are pure CSS). */
export const PAGE_DEBUG_JS_TOOLS: readonly PageDebugToolId[] = ["overflow", "measure", "caret"];

export const PAGE_DEBUG_TOOLS: ReadonlyArray<{ id: PageDebugToolId; label: string; hint: string }> = [
  { id: "outlines", label: "Container outlines", hint: "Outline every block, cell, column and page region" },
  { id: "surfaces", label: "Surface tint", hint: "Tint containers by nesting depth for contrast" },
  { id: "grid", label: "Baseline grid", hint: "8px rhythm overlay to spot spacing drift" },
  { id: "blockInfo", label: "Block info on hover", hint: "Show block type + id on the hovered block" },
  { id: "overflow", label: "Overflow highlighter", hint: "Flag containers whose content overflows" },
  { id: "measure", label: "Hover ruler", hint: "Live size readout for the hovered container" },
  { id: "caret", label: "Caret inspector", hint: "Live caret block + offset readout" },
  { id: "perf", label: "Perf profiler", hint: "Enable the osio:perf console harness" },
];

const PERF_LOCAL_STORAGE_KEY = "osio:perf"; // mirrors shared/lib/perf/measure.ts

interface PageDebugStore {
  enabled: Partial<Record<PageDebugToolId, boolean>>;
  toggle: (id: PageDebugToolId) => void;
  disableAll: () => void;
}

function mirrorPerfFlag(on: boolean) {
  try {
    if (on) globalThis.localStorage?.setItem(PERF_LOCAL_STORAGE_KEY, "1");
    else globalThis.localStorage?.removeItem(PERF_LOCAL_STORAGE_KEY);
  } catch { /* private mode */ }
}

export const usePageDebugStore = create<PageDebugStore>()(
  persist(
    (set, get) => ({
      enabled: {},
      toggle: (id) => {
        const next = !get().enabled[id];
        if (id === "perf") mirrorPerfFlag(next);
        set((state) => ({ enabled: { ...state.enabled, [id]: next } }));
      },
      disableAll: () => {
        mirrorPerfFlag(false);
        set({ enabled: {} });
      },
    }),
    { name: "osionos.debug.tools.v1" },
  ),
);

/** True when any JS-backed tool is on (mounts the lazy overlay). */
export function anyJsDebugToolEnabled(enabled: Partial<Record<PageDebugToolId, boolean>>): boolean {
  return PAGE_DEBUG_JS_TOOLS.some((id) => enabled[id]);
}
