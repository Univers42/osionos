/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readOnlyEmbedMode.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext } from "react";

/** Whether a read-only embed block may mount a live third-party iframe.
 *  `static` (default): hover previews, marketplace, raw preview, profile cards and the
 *  anonymous public page render a link card instead of any frame. `live`: the editor, where
 *  an authenticated member opened the page on purpose. A provider player stays behind its
 *  click either way. */
export type ReadOnlyEmbedMode = "static" | "live";

export const ReadOnlyEmbedModeContext = createContext<ReadOnlyEmbedMode>("static");

/** Whether `view` may be rendered as chosen: a live frame needs a `live` surface, while a
 *  facade, media element or card is safe on both. */
export function allowsView(mode: ReadOnlyEmbedMode, view: { kind: string }): boolean {
  return mode === "live" || view.kind !== "frame";
}
