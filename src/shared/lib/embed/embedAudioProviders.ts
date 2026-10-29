/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedAudioProviders.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Audio providers. Their players are strips of fixed pixel height, so each
 * result carries `height` and an aspect pinned inside the range `safeAspect`
 * accepts. Ported from drawnosaurus `scene/embed.rs`.
 */

import { type ProviderEmbed, audio } from "./embedKit";
import { type UrlParts, encodeComponent, isId, isName, queryValue } from "./embedUrlParts";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "show", "artist"];

export const spotify: Rule = (parts) => {
  let rest = parts.segments;
  // `/intl-fr/track/...` is the same track in another storefront.
  if (rest[0]?.startsWith("intl-")) rest = rest.slice(1);
  if (rest[0] === "embed") rest = rest.slice(1);
  const [kind, id] = rest;
  if (rest.length !== 2 || !SPOTIFY_KINDS.includes(kind) || !isId(id)) return null;
  const height = kind === "track" || kind === "episode" ? 152 : 352;
  return audio("Spotify", `https://open.spotify.com/embed/${kind}/${id}`, 560, height);
};

export const soundcloud: Rule = (parts) => {
  const { segments } = parts;
  if (parts.host === "w.soundcloud.com") {
    const inner = queryValue(parts.query, "url");
    return segments[0] === "player" && inner !== undefined
      ? audio("SoundCloud", `https://w.soundcloud.com/player/?url=${inner}`, 560, 166) : null;
  }
  if (parts.host !== "soundcloud.com" || segments.length < 2 || !segments.every(isName)) return null;
  const track = `https://soundcloud.com/${segments.join("/")}`;
  return audio("SoundCloud", `https://w.soundcloud.com/player/?url=${encodeComponent(track)}`, 560, segments[1] === "sets" ? 450 : 166);
};

export const mixcloud: Rule = (parts) => {
  const { segments } = parts;
  if (segments.length === 2 && segments[0] === "widget" && segments[1] === "iframe") {
    const feed = queryValue(parts.query, "feed");
    return feed === undefined ? null : audio("Mixcloud", `https://www.mixcloud.com/widget/iframe/?feed=${feed}`, 560, 120);
  }
  const [user, show] = segments;
  if (segments.length !== 2 || !isName(user) || !isName(show)) return null;
  return audio("Mixcloud", `https://www.mixcloud.com/widget/iframe/?feed=${encodeComponent(`/${user}/${show}/`)}`, 560, 120);
};

/** `host` is the allow-listed apple domain the link matched. */
export function apple(host: string, parts: UrlParts): ProviderEmbed | null {
  const { segments } = parts;
  if (segments.length < 2 || !segments.every(isName)) return null;
  const item = queryValue(parts.query, "i");
  const single = item !== undefined || segments[1] === "song";
  const query = isId(item) ? `?i=${item}` : "";
  const name = host === "music.apple.com" ? "Apple Music" : "Apple Podcasts";
  return audio(name, `https://embed.${host}/${segments.join("/")}${query}`, 560, single ? 175 : 450);
}
