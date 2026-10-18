/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedHints.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Embeds" shortcuts as data: which provider a slash command or an empty block
 * is waiting for, with the copy the placeholder, the dialog and the slash menu
 * show. Pure: `resolveProviderEmbed` still decides what a pasted link really is,
 * a hint only says what the user said they would paste.
 *
 * Caveat: `example` is a sample URL shape for the input placeholder, not a link
 * that resolves; and a hint never restricts the dialog, so a Vimeo link pasted
 * under the YouTube hint is accepted and embeds as Vimeo.
 */

export interface EmbedHint {
  id: string;
  label: string;
  example: string;
  /** Extra slash search words, besides the label. */
  aliases: readonly string[];
}

export const EMBED_HINTS: readonly EmbedHint[] = [
  { id: "youtube", label: "YouTube", example: "https://www.youtube.com/watch?v=…", aliases: ["youtube", "yt", "video link"] },
  { id: "vimeo", label: "Vimeo", example: "https://vimeo.com/…", aliases: ["vimeo", "video link"] },
  { id: "tiktok", label: "TikTok", example: "https://www.tiktok.com/@user/video/…", aliases: ["tiktok", "video link"] },
  { id: "twitch", label: "Twitch", example: "https://www.twitch.tv/…", aliases: ["twitch", "stream", "video link"] },
  { id: "spotify", label: "Spotify", example: "https://open.spotify.com/track/…", aliases: ["spotify", "music", "audio link", "podcast"] },
  { id: "soundcloud", label: "SoundCloud", example: "https://soundcloud.com/artist/track", aliases: ["soundcloud", "music", "audio link"] },
  { id: "loom", label: "Loom", example: "https://www.loom.com/share/…", aliases: ["loom", "video link", "screen recording"] },
  { id: "figma", label: "Figma", example: "https://www.figma.com/file/…", aliases: ["figma", "design"] },
  { id: "google-maps", label: "Google Maps", example: "https://www.google.com/maps/embed?pb=…", aliases: ["google maps", "maps", "map", "location"] },
  { id: "google-drive", label: "Google Drive", example: "https://drive.google.com/file/d/…", aliases: ["google drive", "drive", "gdrive", "docs"] },
  { id: "tweet", label: "Tweet (X)", example: "https://x.com/user/status/…", aliases: ["tweet", "twitter", "x", "post"] },
  { id: "instagram", label: "Instagram", example: "https://www.instagram.com/p/…", aliases: ["instagram", "insta"] },
  { id: "codepen", label: "CodePen", example: "https://codepen.io/user/pen/…", aliases: ["codepen", "pen", "code"] },
  { id: "gist", label: "GitHub Gist", example: "https://gist.github.com/user/…", aliases: ["gist", "github", "github gist", "code"] },
  { id: "miro", label: "Miro", example: "https://miro.com/app/board/…", aliases: ["miro", "board", "whiteboard link"] },
  { id: "excalidraw", label: "Excalidraw", example: "https://excalidraw.com/#room=…", aliases: ["excalidraw", "diagram", "sketch"] },
  { id: "pdf", label: "PDF", example: "https://example.com/document.pdf", aliases: ["pdf", "document"] },
];

export function embedHintById(id: string | undefined): EmbedHint | undefined {
  return id === undefined ? undefined : EMBED_HINTS.find((hint) => hint.id === id);
}

export type LinkBlockKind = "embed" | "bookmark";

/** What an empty embed/bookmark block says it is waiting for. */
export function linkPlaceholderText(kind: LinkBlockKind, hint?: EmbedHint): string {
  if (hint !== undefined) return `Paste a ${hint.label} link`;
  return kind === "embed" ? "Embed a link" : "Add a web bookmark";
}

/** The dialog's input placeholder. */
export function linkInputPlaceholder(kind: LinkBlockKind, hint?: EmbedHint): string {
  if (hint !== undefined) return hint.example;
  return kind === "embed" ? "Paste a link to embed…" : "Paste a link to bookmark…";
}
