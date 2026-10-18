/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModeAwareEmbedView.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useContext } from "react";

import { appForbiddenOrigins, type EmbedSnapshot } from "@/shared/lib/embed";
import { EmbedView } from "@/shared/ui/embed/EmbedView";
import { LinkCard, type LinkCardData } from "@/shared/ui/embed/LinkCard";
import { chooseEmbedView } from "@/shared/ui/embed/model/chooseEmbedView";

import { allowsView, ReadOnlyEmbedModeContext } from "./readOnlyEmbedMode";

/** `EmbedView`, except on a `static` surface (hover previews, marketplace, raw preview,
 *  chat attachments) where a view that would mount a live frame is a link card. A
 *  click-to-play facade is allowed everywhere: nothing loads until the reader clicks. */
export const ModeAwareEmbedView: React.FC<{
  url: string;
  snapshot: EmbedSnapshot | null;
  height?: number;
}> = ({ url, snapshot, height }) => {
  const mode = useContext(ReadOnlyEmbedModeContext);
  if (!allowsView(mode, chooseEmbedView({ url, snapshot, forbiddenOrigins: appForbiddenOrigins() }))) {
    const card: LinkCardData = snapshot === null ? { url } : { ...snapshot, url };
    return <LinkCard data={card} />;
  }
  return <EmbedView url={url} snapshot={snapshot} height={height} />;
};
