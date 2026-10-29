/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProviderMediaEmbed.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";

import type { Block } from "@/entities/block";
import { parseEmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { resolveProviderEmbed } from "@/shared/lib/embed/embedProviders";
import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";
import { ModeAwareEmbedView } from "./ModeAwareEmbedView";

/** A video/audio/file block whose link is a provider page: the facade or frame of
 *  `EmbedView` instead of a <video>/<audio> that cannot play it (a card on `static` surfaces). Anything else renders
 *  `fallback`, the block's ordinary direct-file preview. */
export const ProviderMediaEmbed: React.FC<{ block: Block; url: string; fallback: React.ReactNode }> = ({
  block,
  url,
  fallback,
}) => {
  const snapshot = useMemo(() => parseEmbedSnapshot(block.embed), [block.embed]);
  const href = safeHttpUrl(url);
  if (href === "" || resolveProviderEmbed(href) === null) return <>{fallback}</>;
  return <ModeAwareEmbedView url={href} snapshot={snapshot} />;
};
