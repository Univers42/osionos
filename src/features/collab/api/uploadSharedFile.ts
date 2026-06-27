/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uploadSharedFile.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The DURABLE upload adapter for `seedSharedFile` (AOC §4). Raw-bytes POST to the
 * membership-gated bridge route `POST /api/collaboration/:id/uploads` (mirrors
 * the proven chat-attachment transport): the bridge proves membership, stores
 * the bytes, and returns a reference. The bytes go HTTP→bridge→storage, NEVER
 * over the realtime transport — the caller announces only the returned reference.
 */

import { API_BASE, getActivePageJwt } from '@/shared/api/client';
import type { SeededFileRef } from '../model/seedSharedFile';

export async function uploadSharedFile(spaceId: string, file: File): Promise<SeededFileRef> {
  if (!API_BASE) throw new Error('VITE_API_URL is not configured.');
  const params = new URLSearchParams({ name: file.name });
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  const token = getActivePageJwt();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/collaboration/${encodeURIComponent(spaceId)}/uploads?${params}`, {
    method: 'POST', headers, body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`seed ${file.name} → ${res.status} ${res.statusText} ${detail}`.trim());
  }
  const body = (await res.json()) as { fileId?: string; name?: string };
  if (!body.fileId) throw new Error(`seed ${file.name} → malformed reference`);
  return { fileId: body.fileId, name: body.name ?? file.name };
}
