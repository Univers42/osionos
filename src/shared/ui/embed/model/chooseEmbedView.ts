/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chooseEmbedView.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Decides what an embed URL (plus an optional stored snapshot) renders as. Pure:
 * the components only draw the answer. Both inputs are untrusted (block JSON can be
 * written by any collaborator), so every URL that can become a `src` is validated
 * here, and the provider table, which we own, decides the player over any snapshot.
 *
 * Caveat: the direct-file test looks at the URL's extension only, so a media URL
 * without one (`/download?id=3`) is framed as a page unless the bridge snapshot
 * says `media`; an extension on a page that is not that file type mis-renders as
 * a broken <video>/<img>.
 */

// Not the barrel: it re-exports the bridge client, which reads import.meta.env
// at load and so cannot run under node --test.
import { embedInfoFromProvider, parseEmbedInfo, type EmbedInfo, type EmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { safeAspect } from "@/shared/lib/embed/embedPolicy";
import { resolveProviderEmbed, type ProviderEmbed } from "@/shared/lib/embed/embedProviders";
import { frameableEmbedUrl, safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";

export type MediaKind = "video" | "audio" | "image";
export type FramePolicy = "provider" | "generic";
export type CardReason = "refused" | "unsafe-frame" | "pdf";

export type EmbedView =
  | { kind: "facade"; embed: ProviderEmbed; title: string; thumb: string; aspect: string }
  | { kind: "frame"; src: string; policy: FramePolicy; aspect?: string; height?: number }
  | { kind: "media"; mediaKind: MediaKind; src: string }
  | { kind: "card"; info: EmbedInfo; reason?: CardReason }
  | { kind: "text"; url: string };

export interface EmbedViewInput {
  url: string;
  snapshot?: EmbedSnapshot | null;
  forbiddenOrigins: readonly string[];
}

const EXTENSION_KINDS: Record<string, MediaKind> = {
  mp4: "video", webm: "video", mov: "video", m4v: "video", ogv: "video",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", svg: "image",
};

const PDF_PATH = /\.pdf$/i;

function mediaKindOfUrl(href: string): MediaKind | null {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(new URL(href).pathname)?.[1]?.toLowerCase();
  return extension === undefined ? null : (EXTENSION_KINDS[extension] ?? null);
}

function mediaKindOfMime(mime: string): MediaKind | null {
  const family = mime.split("/")[0]?.toLowerCase();
  return family === "video" || family === "audio" || family === "image" ? family : null;
}

function bareInfo(href: string): EmbedInfo {
  return {
    url: href, kind: "link", provider: null, title: "", description: "", siteName: "",
    image: "", favicon: "", player: null, media: null, frameable: null,
  };
}

function providerView(embed: ProviderEmbed, info: EmbedInfo, input: EmbedViewInput): EmbedView {
  if (embed.frameable === false) return { kind: "card", info, reason: "refused" };
  const src = frameableEmbedUrl(embed.src, input.forbiddenOrigins);
  if (src === "") return { kind: "card", info, reason: "unsafe-frame" };
  if (embed.kind === "rich") {
    return { kind: "frame", src, policy: "provider", aspect: embed.aspect, height: embed.height };
  }
  const thumb = safeHttpUrl(embed.thumb ?? info.image);
  return { kind: "facade", embed: { ...embed, src }, title: info.title || embed.provider, thumb, aspect: embed.aspect };
}

function snapshotView(info: EmbedInfo, input: EmbedViewInput): EmbedView | null {
  const mediaKind = info.media === null ? null : mediaKindOfMime(info.media.mime);
  if (info.media !== null && mediaKind !== null) return { kind: "media", mediaKind, src: info.media.src };
  // The page's own X-Frame-Options says nothing about a player hosted elsewhere, so
  // `frameable: false` only counts when there is no separate player to frame.
  if (info.player === null) return info.frameable === false ? { kind: "card", info, reason: "refused" } : null;
  const src = frameableEmbedUrl(info.player.src, input.forbiddenOrigins);
  if (src === "") return { kind: "card", info, reason: "unsafe-frame" };
  return { kind: "frame", src, policy: "generic", aspect: safeAspect(info.player.aspect) };
}

export function chooseEmbedView(input: EmbedViewInput): EmbedView {
  const href = safeHttpUrl(input.url);
  if (href === "") return { kind: "text", url: input.url };
  const parsed = parseEmbedInfo(input.snapshot);
  const info = parsed === null ? bareInfo(href) : { ...parsed, url: href };

  const provider = resolveProviderEmbed(href);
  if (provider !== null) {
    return providerView(provider, parsed === null ? embedInfoFromProvider(href, provider) : info, input);
  }
  const directKind = mediaKindOfUrl(href);
  if (directKind !== null) return { kind: "media", mediaKind: directKind, src: href };
  // Chromium does not load a PDF into a sandboxed frame (observed offline: the frame stays
  // empty; see the embedBlocks e2e spec) and the sandbox is not relaxed
  // for it, so a .pdf is a card with Open rather than a blank box.
  if (PDF_PATH.test(new URL(href).pathname)) return { kind: "card", info, reason: "pdf" };
  const fromSnapshot = snapshotView(info, input);
  if (fromSnapshot !== null) return fromSnapshot;
  const src = frameableEmbedUrl(href, input.forbiddenOrigins);
  return src === "" ? { kind: "card", info, reason: "unsafe-frame" } : { kind: "frame", src, policy: "generic" };
}
