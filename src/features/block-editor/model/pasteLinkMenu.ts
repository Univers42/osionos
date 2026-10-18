/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pasteLinkMenu.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The pure half of the Notion paste menu: what a pasted bare URL becomes for each of
// URL, Mention, Bookmark and Embed. No network and no React here: resolving the page
// (resolveLinkSnapshot) starts only after the user has picked, never on paste.

import type { Block, BlockType } from "@/entities/block";
import { createLinkBlock, type LinkBlockType } from "@/entities/block/model/linkBlocks";
import { resolveProviderEmbed } from "@/shared/lib/embed/embedProviders";
import { LINK_MENTION_TITLE } from "@osionos/markdown-engine/markdown/linkMention";
import { bareUrlToLinkSource, hostnameFromUrl } from "@osionos/markdown-engine/markdown/urlSugar";

export type PasteChoice = "url" | "mention" | "bookmark" | "embed";

export const PASTE_CHOICES: readonly { choice: PasteChoice; label: string; description: string }[] = [
  { choice: "url", label: "URL", description: "Keep it as a link" },
  { choice: "mention", label: "Mention", description: "Page title with its icon" },
  { choice: "bookmark", label: "Bookmark", description: "A card with a preview" },
  { choice: "embed", label: "Embed", description: "The page or player, inline" },
];

/** Where the inserted `[host](url)` sits in the block content after the paste. */
export interface PasteLinkContext {
  url: string;
  linkSource: string;
  start: number;
  end: number;
}

export interface PasteEdit {
  /** The block as it must be after the choice (converted in place, or text trimmed). */
  block: Block;
  /** A new embed/bookmark block to place right after `block`. */
  inserted: Block | null;
}

const PASTE_MENU_BLOCK_TYPES = new Set<BlockType>([
  "paragraph", "heading_1", "heading_2", "heading_3", "heading_4", "heading_5", "heading_6",
  "bulleted_list", "numbered_list", "to_do", "toggle", "quote", "callout",
]);

const MAX_MENTION_TITLE = 120;

/** True for page-body text blocks; code, table, database and media blocks never offer the menu. */
export function isPasteMenuBlock(block: Block): boolean {
  return PASTE_MENU_BLOCK_TYPES.has(block.type);
}

/** `content` with `[host](url)` replacing the selection `start..end`, and where it landed. */
export function insertPastedLink(
  content: string,
  rawUrl: string,
  offsets: { start: number; end: number },
): { content: string; context: PasteLinkContext } {
  const url = rawUrl.trim();
  const lo = Math.max(0, Math.min(offsets.start, offsets.end, content.length));
  const hi = Math.max(lo, Math.min(Math.max(offsets.start, offsets.end), content.length));
  const linkSource = bareUrlToLinkSource(url);
  return {
    content: content.slice(0, lo) + linkSource + content.slice(hi),
    context: { url, linkSource, start: lo, end: lo + linkSource.length },
  };
}

/** Embed when a provider recognises the URL, else the plain link. */
export function defaultPasteChoice(url: string): PasteChoice {
  return resolveProviderEmbed(url) === null ? "url" : "embed";
}

/** A mention's link text: one line, no brackets (they would end the link), bounded. */
export function cleanMentionTitle(title: string, url: string): string {
  const cleaned = title.replaceAll(/[[\]\r\n\t]+/g, " ").replaceAll(/\s+/g, " ").trim().slice(0, MAX_MENTION_TITLE);
  return cleaned === "" ? hostnameFromUrl(url) : cleaned;
}

export function mentionLinkSource(title: string, url: string): string {
  return `[${cleanMentionTitle(title, url)}](${url} "${LINK_MENTION_TITLE}")`;
}

/** Where `source` sits in `content`: at `hint` when it is still there, else its first occurrence. */
function locate(content: string, source: string, hint: number): number {
  return content.startsWith(source, hint) ? hint : content.indexOf(source);
}

/** The mention's link text swapped for `title` once the page has been resolved.
 *  Null when the mention is gone (edited or undone while the lookup ran). */
export function withMentionTitle(content: string, context: PasteLinkContext, title: string): string | null {
  const current = mentionLinkSource(hostnameFromUrl(context.url), context.url);
  const at = locate(content, current, context.start);
  if (at < 0) return null;
  return content.slice(0, at) + mentionLinkSource(title, context.url) + content.slice(at + current.length);
}

function withoutLink(content: string, at: number, length: number): string {
  const before = content.slice(0, at);
  const after = content.slice(at + length);
  // Pasting mid-sentence leaves "a  b" once the link is lifted out; keep one space.
  return before.endsWith(" ") && after.startsWith(" ") ? before + after.slice(1) : before + after;
}

function convertedInPlace(block: Block, type: LinkBlockType, url: string): Block {
  const next: Block = { ...block, type, content: url };
  delete next.embed;
  delete next.embedHeight;
  return next;
}

/** The edit a menu choice makes to `block` (whose content holds the pasted link).
 *  Null means "leave the block as it is": the URL choice, or the link is no longer there. */
export function applyPasteChoice(choice: PasteChoice, block: Block, context: PasteLinkContext): PasteEdit | null {
  if (choice === "url") return null;
  const content = block.content ?? "";
  const at = locate(content, context.linkSource, context.start);
  if (at < 0) return null;

  if (choice === "mention") {
    const source = mentionLinkSource(hostnameFromUrl(context.url), context.url);
    const next = content.slice(0, at) + source + content.slice(at + context.linkSource.length);
    return { block: { ...block, content: next }, inserted: null };
  }

  const onlyTheLink = content.slice(0, at).trim() === "" && content.slice(at + context.linkSource.length).trim() === "";
  if (onlyTheLink && !block.children?.length) {
    return { block: convertedInPlace(block, choice, context.url), inserted: null };
  }
  return {
    block: { ...block, content: withoutLink(content, at, context.linkSource.length) },
    inserted: createLinkBlock(choice, context.url),
  };
}
