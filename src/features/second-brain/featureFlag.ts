/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   featureFlag.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase-1 cutover flag (doc 07 §1). When off (default), the legacy SVG
 * `HomeKnowledgeGraph` renders; when `VITE_SECOND_BRAIN_V2=true`, the new
 * Canvas engine (`SecondBrainView`) renders instead. The old widget stays
 * intact until the soak period passes.
 */
export const SECOND_BRAIN_V2 =
  ((import.meta.env as Record<string, string | undefined>).VITE_SECOND_BRAIN_V2 ?? "") === "true";

/** The `<mount>` id segment for nodes derived from the local canonical state. */
export const GRAPH_SOURCE = "db";
