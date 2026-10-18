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

import React, { useMemo } from "react";

import type { Block } from "@/entities/block";
import { clampEmbedHeight, parseEmbedSnapshot } from "@/shared/lib/embed";
import { LinkCard, type LinkCardData } from "@/shared/ui/embed/LinkCard";

import { ModeAwareEmbedView } from "./ModeAwareEmbedView";

/** Read-only `embed` / `bookmark`. `content` is the URL and `block.embed` is untrusted
 *  block JSON, so both are re-validated here on every render (chooseEmbedView, LinkCard,
 *  parseEmbedSnapshot). */
export const ReadOnlyLinkBlock: React.FC<{ block: Block }> = ({ block }) => {
  const url = block.content ?? "";
  const snapshot = useMemo(() => parseEmbedSnapshot(block.embed), [block.embed]);
  if (block.type === "bookmark") {
    const card: LinkCardData = snapshot === null ? { url } : { ...snapshot, url };
    return <LinkCard data={card} />;
  }
  const height = block.embedHeight === undefined ? undefined : clampEmbedHeight(block.embedHeight);
  return <ModeAwareEmbedView url={url} snapshot={snapshot} height={height} />;
};
