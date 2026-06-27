/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageAttachments.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Renders message.attachments[] under the text bubble. image/video/file reuse
 * the editor's MediaBlockPreview (fed a synthetic Block whose asset is the
 * authed object URL — the serve bytes are membership-gated so we fetch them
 * with the page-JWT and hand MediaBlockPreview a blob: source); audio → the
 * voice WaveformPlayer; url → the LinkPreviewCard.
 */

import React, { useState } from 'react';

import { MediaBlockPreview } from '@/entities/block/ui/MediaBlockPreview';
import type { Block } from '@/entities/block';
import type { Attachment } from '@/shared/chat/messageApi';

import { LinkPreviewCard } from './LinkPreviewCard';
import { MediaLightbox } from './MediaLightbox';
import { WaveformPlayer } from './WaveformPlayer';
import { useAuthedObjectUrl } from './useAuthedObjectUrl';

interface MessageAttachmentsProps {
  attachments?: Attachment[];
}

function toBlock(attachment: Attachment, src: string): Block {
  return {
    id: attachment.id ?? attachment.objectKey ?? attachment.url ?? 'attachment',
    type: attachment.type === 'url' ? 'file' : attachment.type,
    content: attachment.name ?? '',
    asset: `url:${src}`,
    mediaWidth: attachment.type === 'image' || attachment.type === 'video' ? 70 : 100,
  };
}

const MediaAttachment: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const src = useAuthedObjectUrl(attachment.url);
  const [zoomed, setZoomed] = useState(false);
  if (!src) {
    return (
      <div className="mt-1 h-24 max-w-md animate-pulse rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]" />
    );
  }
  const isImage = attachment.type === 'image';
  return (
    <div className="mt-1 max-w-md">
      {isImage ? (
        <button type="button" onClick={() => setZoomed(true)} aria-label="View image larger" className="block w-full cursor-zoom-in">
          <MediaBlockPreview block={toBlock(attachment, src)} />
        </button>
      ) : (
        <MediaBlockPreview block={toBlock(attachment, src)} />
      )}
      {zoomed && isImage && <MediaLightbox src={src} name={attachment.name} onClose={() => setZoomed(false)} />}
    </div>
  );
};

export const MessageAttachments: React.FC<MessageAttachmentsProps> = ({ attachments }) => {
  if (!attachments?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((attachment, index) => {
        const key = attachment.id ?? attachment.objectKey ?? `${attachment.type}-${index}`;
        if (attachment.type === 'url') return <LinkPreviewCard key={key} attachment={attachment} />;
        if (attachment.type === 'audio') return <WaveformPlayer key={key} attachment={attachment} />;
        return <MediaAttachment key={key} attachment={attachment} />;
      })}
    </div>
  );
};
