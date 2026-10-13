/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LibraryPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:34:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:34:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { useUserStore } from '@/features/auth';
import { useAssetLibraryStore, type AccountAsset, type AccountAssetKind } from '@/shared/config/assetLibraryStore';
import {
  Button,
  DataTable,
  FeatureCard,
  MiniTabs,
  Section,
} from './settingsUiComponents';

const EMPTY_ASSETS: AccountAsset[] = [];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read import.')));
    reader.readAsDataURL(file);
  });
}

function assetKindFromFile(file: File): AccountAssetKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function formatBytes(value?: number): string {
  if (!value) return 'Local';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export const LibraryPanel = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUserId = useUserStore((s) => s.activeUserId) || 'anonymous';
  const assets = useAssetLibraryStore((s) => s.assetsByUser[activeUserId] ?? EMPTY_ASSETS);
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const removeAsset = useAssetLibraryStore((s) => s.removeAsset);
  const imageAssets = assets.filter((asset) => asset.kind === 'cover' || asset.kind === 'image').slice(0, 9);

  async function handleLibraryUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const uploads = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of uploads) {
      const source = await readFileAsDataUrl(file);
      addAsset(activeUserId, {
        kind: assetKindFromFile(file),
        name: file.name,
        source,
        origin: 'upload',
        mimeType: file.type,
        size: file.size,
      });
    }
  }

  const rows = assets.map((asset) => [
    <div key={asset.id} className="flex min-w-0 items-center gap-3">
      {asset.source.startsWith('data:image') || asset.source.startsWith('http') ? (
        <img src={asset.source} alt="" className="h-10 w-14 rounded object-cover" />
      ) : (
        <span className="flex h-10 w-14 items-center justify-center rounded bg-[var(--osio-bg-subtle)]"><FileText size={16} /></span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{asset.name}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">{asset.mimeType || asset.origin}</div>
      </div>
    </div>,
    asset.kind,
    formatBytes(asset.size),
    <Button key={`${asset.id}-remove`} tone="ghost" className="px-2" onClick={() => removeAsset(activeUserId, asset.id)}><Trash2 size={16} /></Button>,
  ]);

  return (
    <>
      <Section title="Account imports">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MiniTabs active="All" tabs={[{ label: 'All', count: assets.length }, { label: 'Images', count: imageAssets.length }, { label: 'Files' }]} />
          <div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleLibraryUpload} />
            <Button onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Add import</Button>
          </div>
        </div>
        {assets.length > 0 ? (
          <DataTable className="mt-4" headers={['Asset', 'Type', 'Size', '']} rows={rows} />
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-6 py-8 text-center text-sm text-[var(--osio-fg-muted)]">
            No imported assets yet.
          </div>
        )}
      </Section>
      <Section title="Photos">
        {imageAssets.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {imageAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
                <img src={asset.source} alt="" className="h-28 w-full object-cover" />
                <div className="px-3 py-2 text-xs font-medium text-[var(--osio-fg-default)]">{asset.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">{['Cover image', 'Workspace icon', 'Avatar photo'].map((item) => <FeatureCard key={item} icon={<Upload size={16} />} title={item} description="Reusable media for this account." />)}</div>
        )}
      </Section>
    </>
  );
};
