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
 *  `static` (default): hover previews, marketplace, raw preview, profile cards render a
 *  link card instead of any generic frame. `live`: a surface the reader opened on purpose
 *  (the public page) renders the full embed. A provider player stays behind its click either way. */
export type ReadOnlyEmbedMode = "static" | "live";

export const ReadOnlyEmbedModeContext = createContext<ReadOnlyEmbedMode>("static");
