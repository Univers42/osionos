/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   previewCache.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Caveat: entries go stale if the catalogue changes within one session; past 24
// templates the least recently previewed one is rebuilt.

import type { Block } from "@/entities/block";

export const PREVIEW_CACHE_LIMIT = 24;

export function createPreviewCache(limit: number) {
  const entries = new Map<string, Block[]>();
  const get = (id: string): Block[] | undefined => {
    const blocks = entries.get(id);
    if (!blocks) return undefined;
    entries.delete(id);
    entries.set(id, blocks);
    return blocks;
  };
  const set = (id: string, blocks: Block[]): void => {
    entries.delete(id);
    entries.set(id, blocks);
    const oldest = entries.keys().next().value;
    if (entries.size > limit && oldest !== undefined) entries.delete(oldest);
  };
  return { get, set, size: () => entries.size };
}

export const previewCache = createPreviewCache(PREVIEW_CACHE_LIMIT);
