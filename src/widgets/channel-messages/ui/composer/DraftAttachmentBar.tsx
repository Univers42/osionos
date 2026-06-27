/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DraftAttachmentBar.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pre-send chips/thumbnails for the composer's DRAFT attachments. Media drafts
 * reuse the editor's MediaBlockPreview (adapting each to a Block with
 * asset:'url:'+localPreviewUrl); url-type drafts render a compact link card from
 * metadata. Every chip has a remove button.
 */

import React from 'react';
import { X } from 'lucide-react';

import { MediaBlockPreview } from '@/entities/block/ui/MediaBlockPreview';
import type { Block } from '@/entities/block';
import type { Attachment } from '@/shared/chat/messageApi';

interface DraftAttachmentBarProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

function draftToBlock(att: Attachment): Block {
  return {
    id: att.objectKey ?? att.name ?? String(Math.random()),
    type: att.type === 'url' ? 'file' : att.type,
    content: att.name ?? '',
    asset: att.url ? `url:${att.url}` : undefined,
  } as Block;
}

function LinkChip({ att }: Readonly<{ att: Attachment }>) {
  const title = att.metadata?.title ?? att.url ?? 'Link';
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{title}</p>
      {att.metadata?.description && (
        <p className="truncate text-xs text-[var(--osio-fg-muted)]">{att.metadata.description}</p>
      )}
      <p className="truncate text-xs text-[var(--osio-accent)]">{att.url}</p>
    </div>
  );
}

export const DraftAttachmentBar: React.FC<DraftAttachmentBarProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att, index) => (
        <div
          key={`${att.objectKey ?? att.url ?? att.name ?? 'draft'}-${index}`}
          className="relative flex max-w-xs items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2"
        >
          <div className="min-w-0 max-w-[14rem]">
            {att.type === 'url' ? <LinkChip att={att} /> : <MediaBlockPreview block={draftToBlock(att)} />}
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label="Remove attachment"
            className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
