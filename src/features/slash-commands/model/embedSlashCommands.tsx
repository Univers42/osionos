/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedSlashCommands.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  Bookmark, Camera, Clapperboard, Code2, FileText, Globe, LayoutDashboard, Map as MapIcon,
  MessageSquare, Music, Palette, PenTool, Play,
} from "lucide-react";
import type { ReactNode } from "react";

import { EMBEDS_SECTION_ID, EMBED_SLASH_ENTRIES } from "./embedSlashEntries";
import type { SlashLinkBlockCommand } from "./types";

const ICONS: Record<string, ReactNode> = {
  "embeds:embed": <Globe size={16} />, "embeds:bookmark": <Bookmark size={16} />,
  "embeds:youtube": <Play size={16} />, "embeds:vimeo": <Play size={16} />,
  "embeds:tiktok": <Clapperboard size={16} />, "embeds:twitch": <Clapperboard size={16} />,
  "embeds:spotify": <Music size={16} />, "embeds:soundcloud": <Music size={16} />,
  "embeds:loom": <Clapperboard size={16} />, "embeds:figma": <Palette size={16} />,
  "embeds:google-maps": <MapIcon size={16} />, "embeds:google-drive": <FileText size={16} />,
  "embeds:tweet": <MessageSquare size={16} />, "embeds:instagram": <Camera size={16} />,
  "embeds:codepen": <Code2 size={16} />, "embeds:gist": <Code2 size={16} />,
  "embeds:miro": <LayoutDashboard size={16} />, "embeds:excalidraw": <PenTool size={16} />,
  "embeds:pdf": <FileText size={16} />,
};

/** The single source of the "Embeds" slash section. ui-collection's own embed and
 *  bookmark items are dropped by `SUPPORTED_SLASH_TYPES`, so none appears twice. */
export const EMBED_SLASH_COMMANDS: SlashLinkBlockCommand[] = EMBED_SLASH_ENTRIES.map((entry) => ({
  ...entry,
  kind: "link-block",
  section: EMBEDS_SECTION_ID,
  icon: ICONS[entry.id] ?? <Globe size={16} />,
}));
