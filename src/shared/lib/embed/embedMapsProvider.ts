/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedMapsProvider.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Google Maps. A normal share link (`/maps/place/...`, `/maps/@lat,lng,Nz`,
 * `/maps/search/...`, `/maps?q=`) is rebuilt as the keyless
 * `maps.google.com/maps?...&output=embed` form from validated parts only; a
 * `/maps/embed?pb=` link passes through as written.
 *
 * Caveat: `output=embed` is Google's legacy, undocumented embed. If Google
 * retires it these links fall back to a card or a refused frame; the supported
 * Maps Embed API needs a key we do not hold. Short links (`maps.app.goo.gl`,
 * `goo.gl/maps`) hide their target behind a redirect and are never matched.
 */

import { type ProviderEmbed, page } from "./embedKit";
import { type UrlParts, asGiven, encodeComponent, queryValue } from "./embedUrlParts";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

const MAPS_EMBED_BASE = "https://maps.google.com/maps?";
const MAX_QUERY_CHARS = 200;
const NUMBER = /^-?\d{1,3}(?:\.\d{1,15})?$/;
const COORDINATES = /^(-?\d{1,3}(?:\.\d{1,15})?),(-?\d{1,3}(?:\.\d{1,15})?)$/;

function inRange(text: string | undefined, limit: number): text is string {
  return text !== undefined && NUMBER.test(text) && Math.abs(Number(text)) <= limit;
}

function coordinates(text: string): string | null {
  const match = COORDINATES.exec(text);
  return match !== null && inRange(match[1], 90) && inRange(match[2], 180) ? text : null;
}

function zoomOf(text: string | undefined): string | null {
  return text !== undefined && /^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 21 ? text : null;
}

/** Percent-decoded with `+` as a space; null for malformed escapes, control
 *  characters, or text that is empty or long. */
function decodedText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  let text: string;
  try {
    text = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
  } catch {
    return null;
  }
  const hasControl = [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  return text === "" || text.length > MAX_QUERY_CHARS || hasControl ? null : text;
}

function mapsEmbed(query: string, center: string | null, zoom: string | null): ProviderEmbed {
  const pairs = [`q=${coordinates(query) ?? encodeComponent(query)}`];
  if (center !== null) pairs.push(`ll=${center}`);
  if (zoom !== null) pairs.push(`z=${zoom}`);
  return page("Google Maps", `${MAPS_EMBED_BASE}${pairs.join("&")}&output=embed`, 600, 450);
}

/** `@lat,lng,17z` into its validated center and zoom; null for any other shape. */
function viewport(segment: string | undefined): { center: string; zoom: string } | null {
  const match = /^@([^,]+,[^,]+),(\d{1,2})z$/.exec(segment ?? "");
  const center = match === null ? null : coordinates(match[1]);
  const zoom = match === null ? null : zoomOf(match[2]);
  return center === null || zoom === null ? null : { center, zoom };
}

function fromPath(parts: UrlParts): ProviderEmbed | null {
  const [, kind, third, fourth] = parts.segments;
  if (kind === "place") {
    const name = decodedText(third);
    const view = viewport(fourth);
    return name === null || view === null ? null : mapsEmbed(name, view.center, view.zoom);
  }
  if (kind?.startsWith("@")) {
    const view = viewport(kind);
    return view === null ? null : mapsEmbed(view.center, null, view.zoom);
  }
  const query = kind === "search" ? decodedText(third) : null;
  return query === null ? null : mapsEmbed(query, null, null);
}

function fromQuery(parts: UrlParts): ProviderEmbed | null {
  const query = decodedText(queryValue(parts.query, "q"));
  if (query === null) return null;
  const center = queryValue(parts.query, "ll");
  const zoom = zoomOf(queryValue(parts.query, "z"));
  return mapsEmbed(query, center === undefined ? null : coordinates(center), zoom);
}

export const googleMaps: Rule = (parts) => {
  if (parts.host !== "google.com" && parts.host !== "maps.google.com") return null;
  const [root, kind] = parts.segments;
  if (root !== "maps") return null;
  if (kind === "embed") return page("Google Maps", asGiven(parts), 600, 450);
  return parts.segments.length === 1 ? fromQuery(parts) : fromPath(parts);
};
