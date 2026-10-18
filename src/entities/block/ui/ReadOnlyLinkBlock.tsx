/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadOnlyLinkBlock.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useContext, useMemo } from "react";

import type { Block } from "@/entities/block";
import { appForbiddenOrigins, clampEmbedHeight, parseEmbedSnapshot } from "@/shared/lib/embed";
import { EmbedView } from "@/shared/ui/embed/EmbedView";
import { LinkCard, type LinkCardData } from "@/shared/ui/embed/LinkCard";
import { chooseEmbedView } from "@/shared/ui/embed/model/chooseEmbedView";

import { ReadOnlyEmbedModeContext } from "./readOnlyEmbedMode";

/** Read-only `embed` / `bookmark`. `content` is the URL and `block.embed` is untrusted
 *  block JSON, so both are re-validated here on every render (chooseEmbedView, LinkCard,
 *  parseEmbedSnapshot). In `static` mode a view that would mount a frame is a card instead. */
export const ReadOnlyLinkBlock: React.FC<{ block: Block }> = ({ block }) => {
  const mode = useContext(ReadOnlyEmbedModeContext);
  const url = block.content ?? "";
  const snapshot = useMemo(() => parseEmbedSnapshot(block.embed), [block.embed]);
  const card: LinkCardData = snapshot === null ? { url } : { ...snapshot, url };
  if (block.type === "bookmark") return <LinkCard data={card} />;
  if (mode === "static" && chooseEmbedView({ url, snapshot, forbiddenOrigins: appForbiddenOrigins() }).kind === "frame") {
    return <LinkCard data={card} />;
  }
  const height = block.embedHeight === undefined ? undefined : clampEmbedHeight(block.embedHeight);
  return <EmbedView url={url} snapshot={snapshot} height={height} />;
};
