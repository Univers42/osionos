/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedProviders.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure provider table: a pasted link becomes the provider's player URL, or
 * null. No network and nothing stored; the bridge handles every other page.
 *
 * Idempotent by design: a ProviderEmbed's `src` resolves to itself, because a
 * block stores the resolved URL and it is resolved again each time it is shown.
 * The rules, host allow-list and id validation port drawnosaurus
 * `scene/embed.rs`; the corpus in `tests/canvas/embed-providers.test.ts` ports
 * its `tools/embed-check/links.ts`.
 *
 * Caveat: rules match URL shapes seen in 2026, not live providers. A provider
 * that changes its player path breaks silently until the table is updated, and
 * a deleted video still resolves (the provider shows its own error page).
 */

import { apple, mixcloud, soundcloud, spotify } from "./embedAudioProviders";
import {
  codepen, codesandbox, desmos, jsfiddle, miro, openStreetMap, passThrough, stackblitz,
} from "./embedCodeProviders";
import {
  figma, giphy, gist, googleCalendar, googleDocs, googleDrive, googleMaps, msForms, reddit,
  tweet, valTown,
} from "./embedDocProviders";
import type { ProviderEmbed } from "./embedKit";
import {
  bilibili, dailymotion, facebook, instagram, loom, streamable, ted, tiktok, twitch, vimeo,
  youtube,
} from "./embedVideoProviders";
import { type UrlParts, embedSrcOf, providerHostOf, splitUrl } from "./embedUrlParts";
import { safeHttpUrl } from "./embedUrlGuard";

export type { ProviderEmbed, ProviderEmbedKind } from "./embedKit";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

const RULES: Record<string, Rule> = {
  "youtube.com": youtube, "youtu.be": youtube, "youtube-nocookie.com": youtube,
  "vimeo.com": vimeo, "player.vimeo.com": vimeo,
  "drive.google.com": googleDrive, "docs.google.com": googleDocs,
  "calendar.google.com": googleCalendar, "google.com": googleMaps,
  "figma.com": figma, "gist.github.com": gist, "twitter.com": tweet, "x.com": tweet,
  "reddit.com": reddit, "giphy.com": giphy, "val.town": valTown,
  "forms.microsoft.com": msForms, "forms.office.com": msForms,
  "stackblitz.com": stackblitz, "simplepdf.eu": passThrough("SimplePDF", "simplepdf.eu"),
  "link.excalidraw.com": passThrough("Excalidraw", "link.excalidraw.com"),
  "excalidraw.com": passThrough("Excalidraw", "excalidraw.com"),
  "loom.com": loom, "open.spotify.com": spotify, "soundcloud.com": soundcloud,
  "dailymotion.com": dailymotion, "dai.ly": dailymotion, "tiktok.com": tiktok,
  "streamable.com": streamable, "twitch.tv": twitch, "facebook.com": facebook,
  "fb.watch": facebook, "instagram.com": instagram, "bilibili.com": bilibili,
  "codepen.io": codepen, "codesandbox.io": codesandbox, "jsfiddle.net": jsfiddle,
  "openstreetmap.org": openStreetMap, "mixcloud.com": mixcloud, "ted.com": ted,
  "desmos.com": desmos, "miro.com": miro,
};

function applyRule(allowedHost: string, parts: UrlParts): ProviderEmbed | null {
  if (allowedHost === "podcasts.apple.com" || allowedHost === "music.apple.com") return apple(allowedHost, parts);
  return RULES[allowedHost]?.(parts) ?? null;
}

/** A link written with a scheme is read the way the browser reads it before the table
 *  looks at it: `https://evil.example\\@www.youtube.com/` is evil.example to a browser
 *  (and to the Open link) but a YouTube link to a hand-rolled split. Null when the
 *  scheme'd text is not a usable http(s) URL. A bare `youtu.be/abc` has no scheme and
 *  keeps the hand-rolled split. */
function normalizedSource(source: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(source.trim()) ? safeHttpUrl(source) : source;
}

/** The provider's player for a pasted link or embed snippet, else null. */
export function resolveProviderEmbed(rawUrl: string): ProviderEmbed | null {
  const parts = splitUrl(normalizedSource(embedSrcOf(rawUrl)));
  const allowedHost = parts === null ? null : providerHostOf(parts.host);
  if (parts === null || allowedHost === null) return null;
  const embed = applyRule(allowedHost, parts);
  const src = embed === null ? "" : safeHttpUrl(embed.src);
  return embed === null || src === "" ? null : { ...embed, src };
}

/** The frame `src` for the page showing the embed. Twitch refuses to play
 *  without `parent=<hostname>`; every other provider is returned as stored. */
export function playerSrcForHost(embed: ProviderEmbed, hostname: string): string {
  if (embed.provider !== "Twitch" || hostname === "") return embed.src;
  const url = new URL(embed.src);
  url.searchParams.set("parent", hostname);
  return url.href;
}
