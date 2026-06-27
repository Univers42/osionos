/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkPreviewCard.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * url-type attachment → a Notion-style link card: the page favicon + hostname,
 * plus OG title/description/image when the bridge could fetch them. Known
 * embeddable hosts (YouTube, Vimeo) render an inline iframe player instead. The
 * favicon loads client-side (the bridge has no egress; the browser does).
 */

import React, { useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';

import type { Attachment } from '@/shared/chat/messageApi';

interface LinkPreviewCardProps {
  attachment: Attachment;
}

function hostnameOf(link: string): string {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return link; }
}

function faviconOf(link: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostnameOf(link))}&sz=64`;
}

/** A 16:9 iframe embed URL for hosts that permit framing, else null. */
function embedOf(link: string): string | null {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') { const id = url.pathname.slice(1).split('/')[0]; return id ? `https://www.youtube.com/embed/${id}` : null; }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      // watch (?v=), shorts/, embed/, live/, v/ all resolve to the same embed player.
      const id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'vimeo.com') { const id = url.pathname.split('/').filter(Boolean)[0]; return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null; }
    return null;
  } catch { return null; }
}

const Favicon: React.FC<{ link: string }> = ({ link }) => {
  const [broken, setBroken] = useState(false);
  if (broken) return <LinkIcon size={16} className="text-[var(--osio-fg-muted)]" />;
  return <img src={faviconOf(link)} alt="" width={16} height={16} className="rounded-sm" onError={() => setBroken(true)} />;
};

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ attachment }) => {
  const link = attachment.url ?? '';
  const title = attachment.metadata?.title;
  const description = attachment.metadata?.description;
  const image = attachment.metadata?.image;
  const embed = embedOf(link);

  if (embed) {
    return (
      <div className="mt-1 max-w-md overflow-hidden rounded-lg border border-[var(--osio-border-default)]">
        <div className="aspect-video w-full">
          <iframe src={embed} title={title ?? hostnameOf(link)} allow="encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[var(--osio-bg-subtle)] px-3 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]">
          <Favicon link={link} /> <span className="truncate">{hostnameOf(link)}</span>
        </a>
      </div>
    );
  }

  return (
    <a href={link} target="_blank" rel="noreferrer" className="mt-1 block max-w-md overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] transition-colors hover:bg-[var(--osio-bg-hover)]">
      {image && <img src={image} alt="" className="block max-h-44 w-full border-b border-[var(--osio-border-default)] object-cover" />}
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"><Favicon link={link} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs uppercase tracking-wide text-[var(--osio-fg-subtle)]">{hostnameOf(link)}</span>
          {title
            ? <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--osio-fg-default)]">{title}</span>
            : <span className="mt-0.5 block truncate text-sm font-medium text-[var(--osio-accent)]">{link}</span>}
          {description && <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--osio-fg-muted)]">{description}</span>}
        </span>
      </div>
    </a>
  );
};
