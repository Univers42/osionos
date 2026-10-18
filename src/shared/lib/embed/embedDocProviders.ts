/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedDocProviders.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Document, social and design providers: pages whose share URL is not the URL
 * their player lives at. Ported from drawnosaurus `scene/embed.rs`.
 *
 * Caveat: a GitHub gist has no address that can be framed (GitHub serves it
 * only as a script that writes into the page loading it, and drawnosaurus
 * frames a generated document for it). Here it resolves with `frameable:
 * false` so the UI shows a card; it is never framed at its page URL.
 */

import { type ProviderEmbed, page } from "./embedKit";
import {
  type UrlParts, asGiven, encodeComponent, isDigits, isId, isName, queryValue, parseTimestamp,
} from "./embedUrlParts";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

export const googleDrive: Rule = (parts) => {
  const { segments } = parts;
  let fileId: string | undefined;
  if (segments.length >= 3 && segments[0] === "file" && segments[1] === "d") fileId = segments[2];
  else if (segments.length === 1 && (segments[0] === "open" || segments[0] === "uc")) fileId = queryValue(parts.query, "id");
  if (!isId(fileId)) return null;
  const search: string[] = [];
  const key = queryValue(parts.query, "resourcekey");
  if (isId(key)) search.push(`resourcekey=${key}`);
  const seconds = parseTimestamp(parts.query);
  if (seconds > 0) search.push(`t=${seconds}`);
  const tail = search.length > 0 ? `?${search.join("&")}` : "";
  return page("Google Drive", `https://drive.google.com/file/d/${fileId}/preview${tail}`, 560, 315);
};

const DOCS_BASE = "https://docs.google.com";
// kind -> [published suffix, shared suffix, width, height]
const DOCS_KINDS: Record<string, [string, string, number, number]> = {
  document: ["pub?embedded=true", "preview", 560, 720],
  presentation: ["embed", "embed", 640, 389],
  spreadsheets: ["pubhtml?widget=true&headers=false", "preview", 640, 480],
  forms: ["viewform?embedded=true", "", 560, 840],
};

export const googleDocs: Rule = (parts) => {
  const [kind, d, third, fourth] = parts.segments;
  if (!Object.hasOwn(DOCS_KINDS, kind) || d !== "d") return null;
  const [published, shared, width, height] = DOCS_KINDS[kind];
  if (third === "e") {
    return isId(fourth) ? page("Google Docs", `${DOCS_BASE}/${kind}/d/e/${fourth}/${published}`, width, height) : null;
  }
  if (shared === "" || !isId(third)) return null;
  return page("Google Docs", `${DOCS_BASE}/${kind}/d/${third}/${shared}`, width, height);
};

export const googleCalendar: Rule = (parts) =>
  parts.host === "calendar.google.com" && parts.path.includes("/embed") ? page("Google Calendar", asGiven(parts), 800, 600) : null;

export const googleMaps: Rule = (parts) =>
  (parts.host === "google.com" || parts.host === "maps.google.com") && parts.path.startsWith("/maps/embed")
    ? page("Google Maps", asGiven(parts), 600, 450) : null;

export const figma: Rule = (parts) => {
  const square = (src: string): ProviderEmbed => page("Figma", src, 550, 550);
  if (parts.host === "embed.figma.com" || (parts.host === "figma.com" && parts.path === "/embed")) {
    // Already an embed: resolving it again must not wrap it in another one.
    const hasUrl = queryValue(parts.query, "url") !== undefined;
    return hasUrl || parts.host === "embed.figma.com" ? square(asGiven(parts)) : null;
  }
  if (parts.host !== "figma.com" || parts.segments.length === 0) return null;
  const canonical = `https://www.figma.com${parts.path}${parts.query === "" ? "" : `?${parts.query}`}`;
  return square(`https://www.figma.com/embed?embed_host=share&url=${encodeComponent(canonical)}`);
};

export const gist: Rule = (parts) => {
  const [user, rawId] = parts.segments;
  const id = rawId?.replace(/\.js$/, "");
  if (!isId(user) || !isId(id)) return null;
  return { ...page("GitHub Gist", `https://gist.github.com/${user}/${id}`, 550, 720), frameable: false };
};

export const tweet: Rule = (parts) => {
  const { segments } = parts;
  let id: string | undefined;
  if (parts.host === "platform.twitter.com") {
    if (parts.path === "/embed/Tweet.html") id = queryValue(parts.query, "id");
  } else if (segments.length >= 3 && (segments[1] === "status" || segments[1] === "statuses")) id = segments[2];
  else if (segments.length >= 4 && segments[0] === "i" && segments[1] === "web" && segments[2] === "status") id = segments[3];
  return isDigits(id) ? page("X", `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, 480, 560) : null;
};

export const reddit: Rule = (parts) => {
  const [r, sub, comments, id, slug] = parts.segments;
  if (r !== "r" || comments !== "comments" || !isId(sub) || !isId(id)) return null;
  return page("Reddit", `https://embed.reddit.com/r/${sub}/comments/${id}/${isId(slug) ? slug : "_"}/?embed=true`, 560, 480);
};

export const giphy: Rule = (parts) => {
  const [a, b, c] = parts.segments;
  const { length } = parts.segments;
  let raw: string | undefined;
  if (length >= 2 && ["gifs", "clips", "stickers"].includes(a)) raw = b;
  else if (length === 2 && a === "embed") raw = b;
  else if (length >= 2 && a === "media") raw = b;
  else if (length >= 3 && b === "media") raw = c;
  else if (length === 1 && parts.host === "i.giphy.com") raw = a.replace(/\.gif$/, "");
  // A slug is `words-words-ID`: the id is what follows the last hyphen.
  const id = raw?.split("-").pop();
  return isId(id) ? page("GIPHY", `https://giphy.com/embed/${id}`, 480, 360) : null;
};

// Only `/v/<name>` (a val's page) and `/embed/<name>` (what it resolves to) on val.town
// itself. Everything else on *.val.town, such as `someone.web.val.town`, is a page the
// val's author wrote and is not framed with the provider's permissions.
export const valTown: Rule = (parts) => {
  const [kind, name] = parts.segments;
  const isValPath = parts.segments.length === 2 && (kind === "v" || kind === "embed") && isName(name);
  return parts.host === "val.town" && isValPath ? page("val.town", `https://val.town/embed/${name}`) : null;
};

export const msForms: Rule = (parts) => {
  if (parts.host !== "forms.microsoft.com" && parts.host !== "forms.office.com") return null;
  const base = asGiven(parts);
  const src = queryValue(parts.query, "embed") === "true" ? base : `${base}${parts.query === "" ? "?" : "&"}embed=true`;
  return page("Microsoft Forms", src);
};
