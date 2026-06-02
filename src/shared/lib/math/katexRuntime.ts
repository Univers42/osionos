/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   katexRuntime.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type katexNamespace from "katex";

export type KatexApi = typeof katexNamespace;

let instance: KatexApi | null = null;
let loadPromise: Promise<KatexApi> | null = null;
const readyListeners = new Set<() => void>();

/** Synchronous access to the katex singleton, or null until it has loaded. */
export function getLoadedKatex(): KatexApi | null {
  return instance;
}

/**
 * Lazily load katex + its stylesheet (~580 KiB) on first equation render. The
 * module is cached and shared by every math block so it never sits in the
 * editor's critical-path chunk.
 */
export function loadKatex(): Promise<KatexApi> {
  loadPromise ??= (async () => {
    const [module] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
    instance = module.default;
    readyListeners.forEach((listener) => listener());
    readyListeners.clear();
    return instance;
  })();
  return loadPromise;
}

/** Run `listener` once katex is ready (immediately if already loaded). */
export function onKatexReady(listener: () => void): () => void {
  if (instance) {
    listener();
    return () => undefined;
  }
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/** Render LaTeX to HTML, or null when katex has not loaded yet. */
export function renderMathToHtml(source: string, displayMode: boolean): string | null {
  if (!instance) return null;
  const options = { displayMode, throwOnError: false, strict: "ignore" as const };
  try {
    return instance.renderToString(source || (displayMode ? "E = mc^2" : ""), options);
  } catch {
    return instance.renderToString(String.raw`\text{Invalid equation}`, { displayMode, throwOnError: false });
  }
}
