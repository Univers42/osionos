/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   attachmentApi.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Chat attachment transport (bridge-chat contract). The upload is a RAW-bytes
 * POST (body = the File, not JSON) so it bypasses the JSON api client; gallery
 * + link-preview reads go through the normal api client. Link-preview degrades
 * to a bare link card ({ url }) when the bridge has no egress (502).
 */

import { api, API_BASE, getActivePageJwt } from '@/shared/api/client';
import type { Attachment } from '@/shared/chat/messageApi';

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  url: string;
}

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

/** Map a file's MIME to the descriptor `type` the bridge expects. */
function attachmentType(mime: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Upload raw bytes; returns the DRAFT descriptor (no row/url yet). */
export async function uploadAttachment(channelId: string, file: File): Promise<Attachment> {
  if (!API_BASE) throw new Error('VITE_API_URL is not configured.');
  const type = attachmentType(file.type);
  const params = new URLSearchParams({
    channelId,
    name: file.name,
    type,
  });
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  const token = getActivePageJwt();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/chat/uploads?${params}`, {
    method: 'POST',
    headers,
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`upload ${file.name} → ${res.status} ${res.statusText} ${detail}`.trim());
  }
  // The bridge wraps the descriptor: { ok, attachment: { objectKey, type, sha256, … } }.
  // Unwrap it — the bare descriptor is what the composer drafts and sendMessage must
  // carry, or fanOutAttachments drops a file whose objectKey is missing.
  const body = (await res.json()) as { ok?: boolean; attachment?: Attachment };
  if (!body.attachment?.objectKey) throw new Error(`upload ${file.name} → malformed descriptor`);
  return body.attachment;
}

/** Channel media gallery (image/video/audio/file); optional `type` filter. */
export async function fetchChannelMedia(
  channelId: string,
  type?: 'image' | 'video' | 'audio' | 'file',
): Promise<Attachment[]> {
  const search = type ? `?type=${encodeURIComponent(type)}` : '';
  const reply = await api.get<{ ok: boolean; media: Attachment[] }>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/media${search}`,
    jwt(),
  );
  return Array.isArray(reply.media) ? reply.media : [];
}

/** Server-side OpenGraph fetch; degrades to a bare link card on failure/502. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    const reply = await api.post<{ ok: boolean; preview: LinkPreview }>(
      '/api/chat/link-preview',
      { url },
      jwt(),
    );
    return reply.preview?.url ? reply.preview : { url };
  } catch {
    return { url };
  }
}
