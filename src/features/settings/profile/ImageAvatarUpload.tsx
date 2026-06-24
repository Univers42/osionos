/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImageAvatarUpload.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Image avatar upload: file → canvas downscale (≤256px, JPEG/WebP-quality
 * dataUrl ≤200KB) → POST /api/profile/avatar (bridge persists it into
 * osionos_bridge_identities.profile). Silent no-op when the bridge is
 * unavailable (offline runs keep the emoji avatar picker).
 */

import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import { api, getActivePageJwt } from '@/shared/api/client';

const MAX_EDGE = 256;
const MAX_DATA_URL_BYTES = 200 * 1024;

async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.5, 0.3]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_BYTES) return dataUrl;
  }
  throw new Error('Image is too large even after downscaling.');
}

interface ImageAvatarUploadProps {
  onUploaded?: (dataUrl: string) => void;
}

export const ImageAvatarUpload: React.FC<ImageAvatarUploadProps> = ({ onUploaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const handleFile = async (file: File | undefined) => {
    const jwt = getActivePageJwt();
    if (!file || !jwt) return;
    setStatus('busy');
    try {
      const dataUrl = await downscaleToDataUrl(file);
      await api.post('/api/profile/avatar', { dataUrl }, jwt);
      setStatus('done');
      onUploaded?.(dataUrl);
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
        onChange={(event) => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'busy'}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1.5 text-xs font-medium text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={14} /> {status === 'busy' ? 'Uploading…' : 'Upload photo'}
      </button>
      {status === 'done' && <span className="text-xs text-[var(--osio-fg-muted)]">Saved ✓</span>}
      {status === 'error' && <span className="text-xs text-[var(--osio-danger)]">Upload failed</span>}
    </div>
  );
};
