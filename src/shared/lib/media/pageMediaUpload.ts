/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageMediaUpload.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Upload a local file picked in a media block to the bridge's page-media
 * storage (raw-bytes POST, same shape as chat attachments) and return the
 * ABSOLUTE capability URL to embed. Throws when offline / without a session /
 * on any bridge failure — callers fall back to inlining small files.
 */

import { API_BASE, getActivePageJwt } from '@/shared/api/client';

export async function uploadPageMedia(file: File): Promise<string> {
  if (!API_BASE) throw new Error('Bridge is not configured.');
  const token = getActivePageJwt();
  if (!token) throw new Error('No workspace session.');

  const params = new URLSearchParams({ name: file.name });
  const response = await fetch(`${API_BASE}/api/media/uploads?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`media upload → ${response.status} ${detail.slice(0, 120)}`.trim());
  }
  const body = (await response.json()) as { ok?: boolean; media?: { url?: string } };
  const relativeUrl = body.media?.url;
  if (typeof relativeUrl !== 'string' || !relativeUrl.startsWith('/api/media/')) {
    throw new Error('Malformed media upload response.');
  }
  return `${API_BASE}${relativeUrl}`;
}
