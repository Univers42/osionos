/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   giphyApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Giphy search client, called straight from the BROWSER (the bridge has no
 * internet egress). The api key is a public beta-style key inlined at build time
 * (VITE_GIPHY_API_KEY ← GIPHY_API). A picked GIF is downloaded and uploaded
 * through the normal /api/chat/uploads path so it is stored + served + deduped
 * like any image — no runtime dependency on giphy.com once sent.
 */

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const BASE = 'https://api.giphy.com/v1/gifs';

export interface GifItem {
  id: string;
  title: string;
  previewUrl: string;
  fullUrl: string;
  width: number;
  height: number;
}

interface GiphyImage { url?: string; width?: string; height?: string }
interface GiphyGif { id?: string; title?: string; images?: Record<string, GiphyImage> }

export function giphyEnabled(): boolean {
  return Boolean(GIPHY_KEY);
}

function toItem(gif: GiphyGif): GifItem | null {
  const full = gif.images?.fixed_height;
  const preview = gif.images?.fixed_height_small ?? full;
  if (!full?.url || !preview?.url) return null;
  return {
    id: String(gif.id ?? full.url),
    title: gif.title || 'GIF',
    previewUrl: preview.url,
    fullUrl: full.url,
    width: Number(full.width) || 0,
    height: Number(full.height) || 0,
  };
}

async function query(path: 'trending' | 'search', params: Record<string, string>): Promise<GifItem[]> {
  if (!GIPHY_KEY) return [];
  const usp = new URLSearchParams({ api_key: GIPHY_KEY, rating: 'pg-13', ...params });
  const res = await fetch(`${BASE}/${path}?${usp.toString()}`);
  if (!res.ok) throw new Error(`giphy ${path} → ${res.status}`);
  const json = (await res.json()) as { data?: GiphyGif[] };
  return (Array.isArray(json.data) ? json.data : []).map(toItem).filter((g): g is GifItem => g !== null);
}

export function trendingGifs(limit = 24): Promise<GifItem[]> {
  return query('trending', { limit: String(limit) });
}

export function searchGifs(q: string, limit = 24): Promise<GifItem[]> {
  return query('search', { q, limit: String(limit), lang: 'en' });
}

/** Download the chosen GIF's bytes as a File for the normal upload pipeline. */
export async function fetchGifFile(gif: GifItem): Promise<File> {
  const res = await fetch(gif.fullUrl);
  if (!res.ok) throw new Error(`gif download → ${res.status}`);
  const blob = await res.blob();
  const slug = gif.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40).replace(/^-|-$/g, '') || 'giphy';
  return new File([blob], `${slug}.gif`, { type: blob.type || 'image/gif' });
}
