/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedVideoProviders.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Video providers: the page URL a person shares becomes the player URL the
 * provider allows framing (their page sends X-Frame-Options and shows a
 * refusal). Ids are validated before they reach a URL on someone else's domain.
 * Ported from drawnosaurus `scene/embed.rs`; ids and names follow its rules.
 */

import { type ProviderEmbed, page, video } from "./embedKit";
import {
  type UrlParts, asGiven, encodeComponent, isDigits, isId, isName, parseTimestamp, queryValue,
} from "./embedUrlParts";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

export const youtube: Rule = (parts) => {
  const { segments, host } = parts;
  const [first, second] = segments;
  const listParam = queryValue(parts.query, "list");
  let id: string | undefined;
  let list: string | undefined;
  let portrait = false;
  if (host === "youtu.be") id = first;
  else if (segments.length === 1 && first === "watch") id = queryValue(parts.query, "v");
  else if (segments.length === 2 && first === "shorts") [id, portrait] = [second, true];
  else if (segments.length === 2 && ["live", "v", "e"].includes(first)) id = second;
  else if (segments.length === 2 && first === "embed" && second !== "videoseries") id = second;
  else if (
    (segments.length === 2 && first === "embed" && second === "videoseries") ||
    (segments.length === 1 && first === "playlist")
  ) list = listParam;
  else return null;

  // A video shared from inside a playlist keeps the playlist so the player can
  // step through the rest of it.
  let path: string;
  if (id !== undefined) {
    if (!isId(id)) return null;
    path = `embed/${id}${isId(listParam) ? `?list=${listParam}` : ""}`;
  } else {
    if (!isId(list)) return null;
    path = `embed/videoseries?list=${list}`;
  }
  const seconds = parseTimestamp(parts.query);
  const start = seconds > 0 ? `${path.includes("?") ? "&" : "?"}start=${seconds}` : "";
  const src = `https://www.youtube-nocookie.com/${path}${start}`;
  const embed = portrait ? video("YouTube", src, 315, 560) : video("YouTube", src);
  return id === undefined ? embed : { ...embed, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
};

export const vimeo: Rule = (parts) => {
  // The id is the first all-digit segment (after `channels/x/` or `video/`);
  // an unlisted video's privacy hash is the next segment or `h=`.
  const at = parts.segments.findIndex((segment) => /^\d+$/.test(segment));
  if (at < 0) return null;
  const hash = queryValue(parts.query, "h") ?? parts.segments[at + 1];
  const withHash = hash !== undefined && /^[0-9a-fA-F]+$/.test(hash) ? `?h=${hash}` : "";
  return video("Vimeo", `https://player.vimeo.com/video/${parts.segments[at]}${withHash}`);
};

export const dailymotion: Rule = (parts) => {
  const { segments } = parts;
  let raw: string | undefined;
  if (parts.host === "dai.ly") raw = segments[0];
  else if (segments.length === 2 && segments[0] === "video") raw = segments[1];
  else if (segments.length === 3 && segments[0] === "embed" && segments[1] === "video") raw = segments[2];
  else if (segments.length === 1 && segments[0] === "player.html") raw = queryValue(parts.query, "video");
  // `/video/x8abcd_some-title` is a common shape of the same link.
  const id = raw?.split("_")[0];
  return isId(id) ? video("Dailymotion", `https://www.dailymotion.com/embed/video/${id}`) : null;
};

export const tiktok: Rule = (parts) => {
  const { segments } = parts;
  let id: string | undefined;
  if (segments.length === 3 && segments[0].startsWith("@") && segments[1] === "video") id = segments[2];
  else if (segments.length === 3 && segments[0] === "embed" && segments[1] === "v2") id = segments[2];
  else if (segments.length === 2 && segments[0] === "embed") id = segments[1];
  return isDigits(id) ? video("TikTok", `https://www.tiktok.com/embed/v2/${id}`, 340, 700) : null;
};

export const streamable: Rule = (parts) => {
  const { segments } = parts;
  const id = segments.length === 1 ? segments[0]
    : segments.length === 2 && ["e", "o", "s"].includes(segments[0]) ? segments[1] : undefined;
  return isId(id) ? video("Streamable", `https://streamable.com/e/${id}`) : null;
};

// Not channels: paths on twitch.tv that are pages, not a streamer.
const TWITCH_RESERVED = new Set(["directory", "downloads", "jobs", "p", "settings", "subscriptions", "turbo", "wallet", "videos", "search", "friends", "inventory", "drops"]);

const twitchChannel = (channel: string): ProviderEmbed => video("Twitch", `https://player.twitch.tv/?channel=${channel}`);
const twitchVideo = (id: string): ProviderEmbed => video("Twitch", `https://player.twitch.tv/?video=${id}`);
const twitchClip = (slug: string): ProviderEmbed => video("Twitch", `https://clips.twitch.tv/embed?clip=${slug}`);

/** Twitch refuses to play without `parent=<embedding hostname>`; only the page
 *  showing it knows that, so the stored form has none (see playerSrcForHost). */
export const twitch: Rule = (parts) => {
  const { segments, host } = parts;
  if (host === "player.twitch.tv") {
    const channel = queryValue(parts.query, "channel");
    if (isId(channel)) return twitchChannel(channel);
    const id = queryValue(parts.query, "video");
    return isId(id) ? twitchVideo(id) : null;
  }
  if (host === "clips.twitch.tv") {
    const slug = segments.length === 1 && segments[0] === "embed" ? queryValue(parts.query, "clip")
      : segments.length === 1 ? segments[0] : undefined;
    return isId(slug) ? twitchClip(slug) : null;
  }
  if (segments.length === 2 && segments[0] === "videos") return isId(segments[1]) ? twitchVideo(segments[1]) : null;
  if (segments.length === 3 && segments[1] === "clip") return isId(segments[2]) ? twitchClip(segments[2]) : null;
  const [channel] = segments;
  return segments.length === 1 && isId(channel) && !TWITCH_RESERVED.has(channel) ? twitchChannel(channel) : null;
};

function facebookPlugin(parts: UrlParts): ProviderEmbed | null {
  // Already the embed endpoint: kept, so a resolved link resolves to itself.
  const href = queryValue(parts.query, "href");
  if (href === undefined || parts.segments.length !== 2) return null;
  if (parts.segments[1] === "video.php") return video("Facebook", asGiven(parts));
  if (parts.segments[1] !== "post.php") return null;
  return page("Facebook", `https://www.facebook.com/plugins/post.php?href=${href}`, 500, 600);
}

export const facebook: Rule = (parts) => {
  const { segments } = parts;
  if (segments[0] === "plugins") return facebookPlugin(parts);
  let original: string;
  if (parts.host === "fb.watch") {
    if (!isId(segments[0])) return null;
    original = `https://fb.watch/${segments[0]}/`;
  } else {
    const watchV = queryValue(parts.query, "v");
    const isVideo = segments.includes("videos") || segments.includes("reel") || (segments[0] === "watch" && watchV !== undefined);
    const isPost = segments.includes("posts");
    if ((!isVideo && !isPost) || !segments.every(isName)) return null;
    original = `https://www.facebook.com${parts.path}${isId(watchV) ? `?v=${watchV}` : ""}`;
    if (isPost) {
      return page("Facebook", `https://www.facebook.com/plugins/post.php?href=${encodeComponent(original)}`, 500, 600);
    }
  }
  return video("Facebook", `https://www.facebook.com/plugins/video.php?href=${encodeComponent(original)}&show_text=false`);
};

const INSTAGRAM_KINDS = ["p", "reel", "tv"];

export const instagram: Rule = (parts) => {
  const [a, b, c] = parts.segments;
  const { length } = parts.segments;
  let kind: string | undefined;
  let id: string | undefined;
  if (length === 2 && INSTAGRAM_KINDS.includes(a)) [kind, id] = [a, b];
  else if (length >= 3 && INSTAGRAM_KINDS.includes(a) && c === "embed") [kind, id] = [a, b];
  else if (length >= 3 && ["p", "reel"].includes(b)) [kind, id] = [b, c];
  return kind !== undefined && isId(id) ? page("Instagram", `https://www.instagram.com/${kind}/${id}/embed`, 400, 560) : null;
};

const bilibiliPlayer = (query: string): ProviderEmbed =>
  video("Bilibili", `https://player.bilibili.com/player.html?${query}&autoplay=0`);

export const bilibili: Rule = (parts) => {
  if (parts.host === "player.bilibili.com") {
    const bvid = queryValue(parts.query, "bvid");
    return isId(bvid) ? bilibiliPlayer(`bvid=${bvid}`) : null;
  }
  const [first, id] = parts.segments;
  if (first !== "video" || id === undefined) return null;
  const aid = /^av(\d+)$/.exec(id)?.[1];
  if (aid !== undefined) return bilibiliPlayer(`aid=${aid}`);
  return id.startsWith("BV") && isId(id) ? bilibiliPlayer(`bvid=${id}`) : null;
};

export const loom: Rule = (parts) => {
  const [kind, id] = parts.segments;
  return parts.segments.length === 2 && (kind === "share" || kind === "embed") && isId(id)
    ? video("Loom", `https://www.loom.com/embed/${id}`) : null;
};

export const ted: Rule = (parts) => {
  const { segments } = parts;
  const slug = segments.length === 2 && segments[0] === "talks" ? segments[1]
    : segments.length === 3 && segments[1] === "talks" ? segments[2] : undefined;
  return isId(slug) ? video("TED", `https://embed.ted.com/talks/${slug}`) : null;
};
