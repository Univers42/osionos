/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LibraryPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { useAssetLibraryStore, type AccountAsset } from '@/shared/config/assetLibraryStore';
import { Button, IconButton } from '@/shared/ui';
import { DataTable, FeatureCard, MiniTabs, Section } from '../ui/settingsKit';
import { assetKindFromFile, formatBytes, readFileAsDataUrl } from '../model/settingsFiles';

const EMPTY_ASSETS: AccountAsset[] = [];

export const LibraryPanel = () => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
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
        <img src={asset.source} alt="" className="h-10 w-14 rounded-xs object-cover" />
      ) : (
        <span className="flex h-10 w-14 items-center justify-center rounded-xs bg-[var(--osio-bg-subtle)]"><FileText size={16} /></span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{asset.name}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">{asset.mimeType || asset.origin}</div>
      </div>
    </div>,
    asset.kind,
    formatBytes(asset.size),
    <IconButton key={`${asset.id}-remove`} label="Remove asset" onClick={() => removeAsset(activeUserId, asset.id)}><Trash2 size={16} /></IconButton>,
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
