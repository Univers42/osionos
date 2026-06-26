/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaProcessing.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Client-side media guardrails for chat uploads. Validates type + size per kind
 * (so a 100MB file fails gracefully with a toast instead of resetting the bridge
 * socket), and SMART-COMPRESSES images — a 4K PNG (>25MB lossless) is downscaled
 * to <=1920px and re-encoded to WebP (~q0.82), turning ~25MB into ~1MB. Animated
 * GIFs and already-small images pass through untouched. The captured width/height
 * ride along as attachment metadata so the bubble reserves space (no layout shift).
 */

const MB = 1024 * 1024;

/** Per-type byte caps (image is compressed first; this is the raw backstop). */
export const MEDIA_LIMITS = {
  image: 25 * MB,
  video: 50 * MB,
  audio: 16 * MB,
  file: 50 * MB,
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

const IMAGE_MAX_EDGE = 1920;
const IMAGE_QUALITY = 0.82;
const COMPRESS_MIN_BYTES = 512 * 1024; // skip already-small images
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'sh', 'bash', 'zsh', 'ps1', 'jar', 'app', 'dmg', 'deb', 'rpm',
]);

export interface PreparedImage { file: File; width?: number; height?: number }

export function mediaKindOf(file: File): MediaKind {
  const type = file.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function formatBytes(n: number): string {
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Allowlist + size + blocked-extension guard. Returns the resolved kind on pass. */
export function validateFile(file: File): { ok: true; kind: MediaKind } | { ok: false; error: string } {
  const kind = mediaKindOf(file);
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (kind === 'file' && BLOCKED_EXT.has(ext)) {
    return { ok: false, error: `“${file.name}” is an executable and can’t be sent.` };
  }
  if (file.size > MEDIA_LIMITS[kind]) {
    return { ok: false, error: `“${file.name}” is ${formatBytes(file.size)} — over the ${formatBytes(MEDIA_LIMITS[kind])} limit.` };
  }
  return { ok: true, kind };
}

/**
 * Downscale + re-encode an image so uploads stay small. Animated GIFs (preserve
 * animation) and undecodable/tiny images pass through; only dimensions are added.
 * Falls back to the original whenever re-encoding wouldn't actually shrink it.
 */
export async function compressImage(file: File): Promise<PreparedImage> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return { file };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file };
  }
  const { width: w0, height: h0 } = bitmap;
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(w0, h0, 1));
  if (scale === 1 && file.size <= COMPRESS_MIN_BYTES) {
    bitmap.close?.();
    return { file, width: w0, height: h0 };
  }
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return { file, width: w0, height: h0 };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', IMAGE_QUALITY),
  );
  if (!blob || blob.size >= file.size) return { file, width: w0, height: h0 };
  const name = `${file.name.replace(/\.[^.]+$/, '')}.webp`;
  return { file: new File([blob], name, { type: 'image/webp' }), width, height };
}
