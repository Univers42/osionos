/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlayerFacade.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Play } from "lucide-react";

import { aspectBoxStyle, clampEmbedHeight, playerSrcForHost, safeHttpUrl, type ProviderEmbed } from "@/shared/lib/embed";

import { WebEmbedFrame } from "./WebEmbedFrame";
import { playLabel } from "./model/chooseEmbedView";

interface Props {
  embed: ProviderEmbed;
  title: string;
  /** Thumbnail URL; validated again here. "" shows a neutral tile. */
  thumb?: string;
  aspect: string;
  /** A fixed-pixel player (audio strips): the box is this tall at full width, never aspect-scaled. */
  height?: number;
  interactive?: boolean;
}

/** The player URL with autoplay on, and Twitch's `parent` for this host. */
function playingSrc(embed: ProviderEmbed): string {
  const url = new URL(playerSrcForHost(embed, globalThis.location?.hostname ?? ""));
  url.searchParams.set("autoplay", "1");
  return url.href;
}

/** A thumbnail with a play button that mounts the real player on click. Every pane
 *  mounts a live editor, so without this a page of eight videos loads eight players. */
export const PlayerFacade: React.FC<Props> = ({ embed, title, thumb = "", aspect, height, interactive = true }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  if (isPlaying) {
    return <WebEmbedFrame src={playingSrc(embed)} title={title || embed.provider} policy="provider" aspect={aspect} height={height} interactive={interactive} />;
  }
  const image = safeHttpUrl(thumb);
  return (
    <button
      type="button"
      aria-label={playLabel(title, embed.provider)}
      onClick={() => setIsPlaying(true)}
      style={height === undefined ? aspectBoxStyle(aspect) : { height: clampEmbedHeight(height) }}
      className="group/facade relative flex w-full items-center justify-center overflow-hidden rounded-md bg-[var(--osio-bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
    >
      {image === "" ? (
        <span className="text-sm font-semibold text-[var(--osio-fg-muted)]">{embed.provider}</span>
      ) : (
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--osio-bg-elevated)] text-[var(--osio-fg-default)] transition-transform group-hover/facade:scale-105">
        <Play aria-hidden size={20} />
      </span>
    </button>
  );
};
