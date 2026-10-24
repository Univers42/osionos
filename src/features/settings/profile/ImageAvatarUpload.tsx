/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImageAvatarUpload.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Image avatar upload: file → three square WebP variants (64 / 160 / 460) →
 * POST /api/profile/avatar. The bridge checks the bytes, strips their metadata,
 * stores them in the `avatars` bucket and writes the path into
 * `osionos_profiles.avatar_url`; the response carries the URL to show.
 *
 * The body is exactly `{ variants: { "64": b64, "160": b64, "460": b64 } }`
 * (WebP or JPEG, each square at its size, under its cap) — the same shape the
 * route reads.
 *
 * Silent no-op when the bridge is unavailable (offline runs keep the emoji
 * avatar picker).
 */

import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { buildAvatarVariants, type EncodedAvatar } from './avatarVariants';

interface ImageAvatarUploadProps {
  onUploaded?: (avatarUrl: string) => void;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Draws the centre square of the source into a `size` canvas. The crop keeps
 * the avatar square whatever the source is — the bridge refuses a variant that
 * is not.
 */
async function drawSquare(bitmap: ImageBitmap, size: number, type: string, quality: number): Promise<EncodedAvatar | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await canvasToBlob(canvas, type, quality);
  if (!blob) return null;
  return { type: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export const ImageAvatarUpload: React.FC<ImageAvatarUploadProps> = ({ onUploaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const handleFile = async (file: File | undefined) => {
    const jwt = getActivePageJwt();
    if (!file || !jwt) return;
    setStatus('busy');
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const variants = await buildAvatarVariants((size, type, quality) => drawSquare(bitmap, size, type, quality));
        const response = await api.post<{ avatar?: string }>('/api/profile/avatar', { variants }, jwt);
        setStatus('done');
        onUploaded?.(response?.avatar ?? '');
      } finally {
        bitmap.close();
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ''; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'busy'}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1.5 text-xs font-medium text-[var(--osio-fg-muted)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={14} /> {status === 'busy' ? 'Uploading…' : 'Upload photo'}
      </button>
      {status === 'done' && <span className="text-xs text-[var(--osio-fg-muted)]">Saved ✓</span>}
      {status === 'error' && <span className="text-xs text-[var(--osio-danger)]">Upload failed</span>}
    </div>
  );
};
