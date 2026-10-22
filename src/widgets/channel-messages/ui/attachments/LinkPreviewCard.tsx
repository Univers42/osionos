/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkPreviewCard.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * url-type attachment → a Notion-style card. A link the provider table knows
 * (YouTube, Vimeo, Spotify, ...) becomes a click-to-play player; anything else is a
 * bookmark card. The player is derived from `attachment.url` ALONE: `metadata` comes
 * from the message author and is shown as text and an image, never framed.
 */

import React from 'react';

import type { Attachment } from '@/shared/chat/messageApi';
import { resolveProviderEmbed, safeHttpUrl } from '@/shared/lib/embed';
import { EmbedFooter } from '@/shared/ui/embed/EmbedFooter';
import { LinkCard } from '@/shared/ui/embed/LinkCard';
import { PlayerFacade } from '@/shared/ui/embed/PlayerFacade';

interface LinkPreviewCardProps {
  attachment: Attachment;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ attachment }) => {
  const link = attachment.url ?? '';
  const metadata = attachment.metadata;
  const embed = resolveProviderEmbed(link);

  if (embed !== null && embed.kind !== 'rich' && embed.frameable !== false) {
    return (
      <div className="mt-1 max-w-md">
        <PlayerFacade embed={embed} title={metadata?.title || embed.provider} thumb={embed.thumb ?? metadata?.image} aspect={embed.aspect} />
        <EmbedFooter framedSrc={embed.src} openUrl={safeHttpUrl(link)} />
      </div>
    );
  }
  return (
    <div className="mt-1 max-w-md">
      <LinkCard data={{ url: link, title: metadata?.title, description: metadata?.description, image: metadata?.image }} />
    </div>
  );
};
