/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   deriveTagConfig.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState } from "@notion-db/contract-types";
import type { TagConfig } from "./edges/tagEdges";

/**
 * Auto-derive a `TagConfig` from the schema so local mode (doc 03 / Phase 4)
 * synthesizes the same associative tag edges the BaaS generates server-side.
 * For each database it picks the obvious tag property — a `multi_select`, or one
 * named "tag"/"tags" — and lets `tagEdges` (hub-by-default, with the explosion
 * guards) turn shared tags into edges.
 */
export function deriveTagConfig(state: NotionState): TagConfig {
  const tagProperties: Record<string, string> = {};
  for (const database of Object.values(state.databases)) {
    const property = Object.values(database.properties).find(
      (candidate) => candidate.type === "multi_select" || /^tags?$/i.test(candidate.name),
    );
    if (property) tagProperties[database.id] = property.id;
  }
  return { tagProperties };
}
