/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   unsplash.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from "@/shared/api/client";
import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";

const ENV = import.meta.env as Record<string, string | undefined>;
const DIRECT_ACCESS_KEY = (ENV.VITE_UNSPLASH_ACCESS_KEY ?? "").trim();
const DEFAULT_PROXY_PATH = "/api/media/unsplash/search";
const PROXY_PATH = (ENV.VITE_UNSPLASH_PROXY_PATH ?? DEFAULT_PROXY_PATH).trim();

interface UnsplashSearchOptions {
  query: string;
  perPage?: number;
  orientation?: "landscape" | "portrait" | "squarish";
  signal?: AbortSignal;
}

interface UnsplashRawPhoto {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: {
    raw?: string;
    full?: string;
    regular?: string;
    small?: string;
    thumb?: string;
  };
  links?: {
    html?: string;
    download_location?: string;
  };
  user?: {
    name?: string;
  };
}

export interface UnsplashPickerAsset extends CoverPickerAsset {
  downloadLocation?: string;
  author?: string;
}

type UnsplashGatewayPayload =
  | { results?: unknown[]; photos?: unknown[]; items?: unknown[] }
  | unknown[];

function readItems(payload: UnsplashGatewayPayload): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.photos)) return payload.photos;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function appendImageParams(url: string, width: number): string {
  try {
    const next = new URL(url);
    next.searchParams.set("auto", "format");
    next.searchParams.set("fit", "crop");
    next.searchParams.set("w", String(width));
    next.searchParams.set("q", width > 1000 ? "80" : "70");
    return next.toString();
  } catch {
    return url;
  }
}

function normalizePhoto(raw: unknown): UnsplashPickerAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const photo = raw as UnsplashRawPhoto & Partial<UnsplashPickerAsset>;

  if (typeof photo.ref === "string") {
    return {
      id: String(photo.id ?? photo.ref),
      label: String(photo.label ?? "Unsplash photo"),
      ref: photo.ref,
      previewUrl: photo.previewUrl ?? photo.ref,
      credit: photo.credit ?? "Unsplash",
      downloadLocation: photo.downloadLocation,
      author: photo.author,
    };
  }

  const regular = photo.urls?.regular ?? photo.urls?.full ?? photo.urls?.raw;
  if (!regular) return null;

  const label =
    photo.alt_description ??
    photo.description ??
    (photo.user?.name ? `Photo by ${photo.user.name}` : "Unsplash photo");
  const author = photo.user?.name;

  return {
    id: `unsplash-${photo.id ?? regular}`,
    label,
    ref: appendImageParams(regular, 1800),
    previewUrl: appendImageParams(photo.urls?.small ?? regular, 720),
    credit: author ? `Unsplash · ${author}` : "Unsplash",
    downloadLocation: photo.links?.download_location,
    author,
  };
}

async function fetchViaBridge(options: UnsplashSearchOptions): Promise<UnsplashPickerAsset[]> {
  const params = new URLSearchParams({
    query: options.query,
    perPage: String(options.perPage ?? 12),
    orientation: options.orientation ?? "landscape",
  });
  const payload = await api.get<UnsplashGatewayPayload>(`${PROXY_PATH}?${params.toString()}`);
  return readItems(payload).map(normalizePhoto).filter((item): item is UnsplashPickerAsset => Boolean(item));
}

async function fetchDirect(options: UnsplashSearchOptions): Promise<UnsplashPickerAsset[]> {
  if (!DIRECT_ACCESS_KEY) return [];

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", options.query);
  url.searchParams.set("per_page", String(options.perPage ?? 12));
  url.searchParams.set("orientation", options.orientation ?? "landscape");
  url.searchParams.set("content_filter", "high");

  const response = await fetch(url.toString(), {
    signal: options.signal,
    headers: { Authorization: `Client-ID ${DIRECT_ACCESS_KEY}` },
  });
  if (!response.ok) return [];

  const payload = (await response.json().catch(() => ({}))) as UnsplashGatewayPayload;
  return readItems(payload).map(normalizePhoto).filter((item): item is UnsplashPickerAsset => Boolean(item));
}

export async function searchUnsplashPickerAssets(
  options: UnsplashSearchOptions,
): Promise<UnsplashPickerAsset[]> {
  const query = options.query.trim() || "people workspace";
  const request = { ...options, query };

  try {
    const bridgeItems = await fetchViaBridge(request);
    if (bridgeItems.length > 0) return bridgeItems;
  } catch {
    // The app can still run offline or with a public Unsplash access key.
  }

  return fetchDirect(request);
}

export function toMediaPickerAsset(item: UnsplashPickerAsset): CoverPickerAsset {
  return {
    ...item,
    ref: `url:${item.ref}`,
    previewUrl: item.previewUrl,
  };
}
