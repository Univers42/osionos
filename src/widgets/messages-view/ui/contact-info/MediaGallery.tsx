/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaGallery.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Media, links & docs" gallery for the contact-info panel. Media/Links/Docs
 * MiniTabs filter the channel media by type. Image/video tiles reuse the
 * entities/block MediaBlockPreview (Attachment.url → asset "url:<abs>"); link
 * tiles render a compact card from metadata.{title,description}; doc tiles are
 * download links. Data comes from useChannelMedia (grouped).
 */

import React, { useState } from 'react';

import { API_BASE } from '@/shared/api/client';
import type { Attachment } from '@/shared/chat/messageApi';
import { createMediaBlock, type MediaBlockType } from '@/entities/block';
import { MediaBlockPreview } from '@/entities/block/ui/MediaBlockPreview';
import { MiniTabs } from '@/shared/ui';
import { useChannelMedia } from '../../model/useChannelMedia';

type GalleryTab = 'media' | 'links' | 'docs';

/** Attachment.url is a bridge-relative path; absolutize so <img>/href resolve. */
function absUrl(url?: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

const MediaTile: React.FC<{ item: Attachment }> = ({ item }) => {
  const block = createMediaBlock(item.type as MediaBlockType, `url:${absUrl(item.url)}`);
  return <MediaBlockPreview block={block} />;
};

const LinkTile: React.FC<{ item: Attachment }> = ({ item }) => (
  <a
    href={absUrl(item.url) || item.metadata?.title}
    target="_blank"
    rel="noreferrer"
    className="col-span-3 block rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3 hover:bg-[var(--osio-bg-hover)]"
  >
    <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">
      {item.metadata?.title || item.name || 'Link'}
    </span>
    {item.metadata?.description ? (
      <span className="mt-0.5 block truncate text-xs text-[var(--osio-fg-muted)]">
        {item.metadata.description}
      </span>
    ) : null}
  </a>
);

const DocTile: React.FC<{ item: Attachment }> = ({ item }) => (
  <a
    href={absUrl(item.url)}
    download={item.name}
    className="col-span-3 flex items-center gap-2 truncate rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2.5 text-sm hover:bg-[var(--osio-bg-hover)]"
  >
    <span className="truncate text-[var(--osio-fg-default)]">{item.name || 'File'}</span>
  </a>
);

function tilesFor(tab: GalleryTab, groups: ReturnType<typeof useChannelMedia>['groups']): Attachment[] {
  if (tab === 'links') return groups.links;
  if (tab === 'docs') return groups.docs;
  return groups.media;
}

export const MediaGallery: React.FC<{ channelId: string | null }> = ({ channelId }) => {
  const { groups, loading } = useChannelMedia(channelId);
  const [tab, setTab] = useState<GalleryTab>('media');
  const items = tilesFor(tab, groups);

  return (
    <div className="grid gap-2">
      <MiniTabs
        value={tab}
        onChange={setTab}
        size="sm"
        options={[
          { value: 'media', label: 'Media', count: groups.media.length },
          { value: 'links', label: 'Links', count: groups.links.length },
          { value: 'docs', label: 'Docs', count: groups.docs.length },
        ]}
      />
      {loading && items.length === 0 ? (
        <p className="py-3 text-sm text-[var(--osio-fg-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-[var(--osio-fg-subtle)]">Nothing shared yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item, index) => {
            const key = item.id ?? `${tab}-${index}`;
            if (tab === 'links') return <LinkTile key={key} item={item} />;
            if (tab === 'docs') return <DocTile key={key} item={item} />;
            return <MediaTile key={key} item={item} />;
          })}
        </div>
      )}
    </div>
  );
};
