/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedSlashEntries.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { EMBED_HINTS } from "@/shared/lib/embed/embedHints";

export const EMBEDS_SECTION_ID = "embeds";

export interface EmbedSlashEntry {
  id: string;
  label: string;
  aliases: string[];
  description: string;
  blockType: "embed" | "bookmark";
  /** The provider the new block waits for; absent for the generic entries. */
  hintId?: string;
}

// "iframe" and "web" find /embed; "video link" comes from the video providers' hints.
const GENERIC_ENTRIES: EmbedSlashEntry[] = [
  {
    id: "embeds:embed",
    label: "Embed",
    aliases: ["embed", "iframe", "web", "website", "link embed", "web page"],
    description: "Embed — any web page or app",
    blockType: "embed",
  },
  {
    id: "embeds:bookmark",
    label: "Web bookmark",
    aliases: ["bookmark", "link card", "web bookmark", "card", "website"],
    description: "Web bookmark — a link card",
    blockType: "bookmark",
  },
];

export const EMBED_SLASH_ENTRIES: EmbedSlashEntry[] = [
  ...GENERIC_ENTRIES,
  ...EMBED_HINTS.map((hint): EmbedSlashEntry => ({
    id: `embeds:${hint.id}`,
    label: hint.label,
    aliases: [...hint.aliases],
    description: `Embed a ${hint.label} link`,
    blockType: "embed",
    hintId: hint.id,
  })),
];
