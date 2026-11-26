/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBaseTheme.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useSyncExternalStore } from "react";

export type BaseTheme = "light" | "dark";

/** Calls `onChange` whenever <html data-theme> is rewritten; returns the unsubscribe. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** The light/dark base theme.ts last wrote on <html>. */
function read(): BaseTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The app's resolved light/dark base, live — for a renderer that cannot read
 *  CSS tokens (mermaid picks its palette in JS). */
export function useBaseTheme(): BaseTheme {
  return useSyncExternalStore(subscribe, read, () => "light");
}
