/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkTurnInto.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// "Turn into" between Link, Bookmark and Embed. Pure: the caller swaps the block into
// the tree (one undo step) and, when `needsSnapshot`, resolves the URL afterwards.

import type { Block } from "@/entities/block";
import { isLinkBlockType, type LinkBlockType } from "@/entities/block/model/linkBlocks";
import { parseEmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { findLinks } from "@/components/blocks/linkSourceEdit";
import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";
import { cleanMentionTitle } from "./pasteLinkMenu";

export type LinkTurnTarget = LinkBlockType | "link";

export interface LinkTurnOption {
  target: LinkTurnTarget;
  label: string;
  active: boolean;
}

export interface LinkTurnResult {
  block: Block;
  /** True when the block has no stored snapshot for its URL yet. */
  needsSnapshot: boolean;
}

const LABELS: Record<LinkTurnTarget, string> = { embed: "Embed", bookmark: "Bookmark", link: "Link" };

/** The http(s) URL of a paragraph that holds exactly one link and nothing else, else "". */
export function soleLinkUrl(block: Block): string {
  if (block.type !== "paragraph" || block.children?.length) return "";
  const content = (block.content ?? "").trim();
  const links = findLinks(content);
  const only = links.length === 1 && links[0].start === 0 && links[0].end === content.length;
  return only ? safeHttpUrl(links[0].href) : "";
}

function option(target: LinkTurnTarget, block: Block): LinkTurnOption {
  return { target, label: LABELS[target], active: block.type === target };
}

export function linkTurnIntoOptions(block: Block): LinkTurnOption[] {
  if (isLinkBlockType(block.type)) return (["embed", "bookmark", "link"] as const).map((target) => option(target, block));
  return soleLinkUrl(block) === "" ? [] : (["bookmark", "embed"] as const).map((target) => option(target, block));
}

function linkParagraph(block: Block): Block {
  const url = block.content ?? "";
  const title = cleanMentionTitle(parseEmbedSnapshot(block.embed)?.title ?? "", url);
  const next: Block = { ...block, type: "paragraph", content: `[${title}](${url})` };
  delete next.embed;
  delete next.embedHeight;
  return next;
}

function linkBlockOf(block: Block, target: LinkBlockType, url: string): Block {
  const { embedHeight, ...rest } = block;
  const keepsHeight = target === "embed" && embedHeight !== undefined;
  return { ...rest, type: target, content: url, ...(keepsHeight ? { embedHeight } : {}) };
}

/** The block `block` becomes for `target`, or null when that turn is not offered. */
export function turnLinkBlockInto(block: Block, target: LinkTurnTarget): LinkTurnResult | null {
  if (isLinkBlockType(block.type)) {
    if (target === "link") return { block: linkParagraph(block), needsSnapshot: false };
    if (target === block.type) return null;
    return { block: linkBlockOf(block, target, block.content ?? ""), needsSnapshot: block.embed === undefined };
  }
  const url = soleLinkUrl(block);
  if (url === "" || target === "link") return null;
  return { block: linkBlockOf(block, target, url), needsSnapshot: true };
}
