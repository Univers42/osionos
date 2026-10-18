/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedCodeProviders.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Code, whiteboard and map providers. Those whose ordinary pages already frame
 * (StackBlitz, Excalidraw, SimplePDF, OpenStreetMap's export page, val.town)
 * pass through as written, on their own host only. Ported from drawnosaurus `scene/embed.rs`.
 */

import { type ProviderEmbed, page } from "./embedKit";
import { type UrlParts, asGiven, isId, isName, queryValue } from "./embedUrlParts";

type Rule = (parts: UrlParts) => ProviderEmbed | null;

export const codepen: Rule = (parts) => {
  const { segments } = parts;
  const kinds = ["pen", "embed", "full"];
  const embed = (owner: string, id: string): ProviderEmbed =>
    page("CodePen", `https://codepen.io/${owner}/embed/${id}?default-tab=result`, 560, 400);
  if (segments[0] === "team" && kinds.includes(segments[2]) && isName(segments[1]) && isId(segments[3])) {
    return embed(`team/${segments[1]}`, segments[3]);
  }
  return kinds.includes(segments[1]) && isName(segments[0]) && isId(segments[2]) ? embed(segments[0], segments[2]) : null;
};

export const codesandbox: Rule = (parts) => {
  const [a, b, c] = parts.segments;
  const { length } = parts.segments;
  const id = length === 2 && (a === "s" || a === "embed") ? b
    : length === 3 && a === "p" && (b === "sandbox" || b === "devbox") ? c : undefined;
  return isId(id) ? page("CodeSandbox", `https://codesandbox.io/embed/${id}`, 800, 500) : null;
};

export const jsfiddle: Rule = (parts) => {
  const stop = parts.segments.findIndex((segment) => segment === "embedded" || segment === "show");
  const segments = stop < 0 ? parts.segments : parts.segments.slice(0, stop);
  const [a, b, c] = segments;
  let path: string | null = null;
  if (segments.length === 1 && isId(a)) path = a;
  else if (segments.length === 2 && isName(a) && isId(b)) path = `${a}/${b}`;
  else if (segments.length === 3 && isName(a) && isId(b) && isId(c)) path = `${a}/${b}/${c}`;
  return path === null ? null : page("JSFiddle", `https://jsfiddle.net/${path}/embedded/`, 560, 400);
};

export const desmos: Rule = (parts) => {
  const [kind, id] = parts.segments;
  const { length } = parts.segments;
  if (length === 2 && kind === "calculator" && isId(id)) {
    return page("Desmos", `https://www.desmos.com/calculator/${id}?embed`, 560, 400);
  }
  const bare = parts.host === "desmos.com" && length === 1 && ["calculator", "geometry", "scientific", "3d"].includes(kind);
  return bare ? page("Desmos", asGiven(parts), 560, 400) : null;
};

export const miro: Rule = (parts) => {
  const [app, kind, id] = parts.segments;
  const valid = app === "app" && (kind === "board" || kind === "live-embed") && id !== undefined && isName(id.replace(/=/g, ""));
  return valid ? page("Miro", `https://miro.com/app/live-embed/${id}/`, 640, 480) : null;
};

export const stackblitz: Rule = (parts) => {
  if (parts.host !== "stackblitz.com") return null;
  const base = asGiven(parts);
  const src = queryValue(parts.query, "embed") !== undefined ? base : `${base}${parts.query === "" ? "?" : "&"}embed=1`;
  return page("StackBlitz", src, 800, 560);
};

/** Frames the link as written, but only on `host` itself: a subdomain of an allow-listed
 *  domain can be user content (`x.excalidraw.com`) and must not inherit the provider. */
export const passThrough = (provider: string, host: string): Rule => (parts) =>
  parts.host === host ? page(provider, asGiven(parts)) : null;

export const openStreetMap: Rule = (parts) =>
  parts.host === "openstreetmap.org" && parts.path === "/export/embed.html" ? page("OpenStreetMap", asGiven(parts), 600, 450) : null;
