/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverVideos.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Video search for the cover picker. The bridge owns the provider: it holds the
// Pixabay key and the 24-hour cache Pixabay's terms ask for, and answers with
// items already shaped for a cover tile. This file does not fall back to a
// direct provider call — a key in the browser bundle is a published key.

import { api } from "@/shared/api/client";
import type { CoverPickerAsset } from "@/shared/ui/assets/uiCollectionAssets";

const PAGE_SIZE = 18;

function isCoverVideo(value: unknown): value is CoverPickerAsset {
  if (typeof value !== "object" || value === null) return false;
  return ["id", "label", "ref"].every((key) => typeof Reflect.get(value, key) === "string");
}

/** Videos matching `query`. Rejects when no bridge answers (offline build, or
 *  a bridge without a key), so the caller can say search is unavailable. */
export async function searchCoverVideos(query: string): Promise<CoverPickerAsset[]> {
  const params = new URLSearchParams({ query, perPage: String(PAGE_SIZE) });
  const payload = await api.get<unknown>(`/api/media/pixabay/videos?${params.toString()}`);
  if (typeof payload !== "object" || payload === null) return [];
  const results: unknown = Reflect.get(payload, "results");
  return Array.isArray(results) ? results.filter(isCoverVideo) : [];
}
