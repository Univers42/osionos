/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsFiles.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AccountAssetKind } from '@/shared/config/assetLibraryStore';

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read import.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read import.')));
    reader.readAsDataURL(file);
  });
}

export function assetKindFromFile(file: File): AccountAssetKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function formatBytes(value?: number): string {
  if (!value) return 'Local';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(fileName: string, content: string, type = 'text/plain') {
  downloadBlob(fileName, new Blob([content], { type }));
}

export function csvCell(value: unknown): string {
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
  return `"${String(primitive).replaceAll('"', '""')}"`;
}

export function safeSlug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || 'export';
}
export function stringPayload(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}
