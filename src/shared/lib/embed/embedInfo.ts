/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedInfo.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The EmbedInfo runtime contract: what the bridge returns from
 * `/api/embed/resolve` and what a block stores as its snapshot. Both come from
 * outside the type system (a network reply, block JSON any collaborator can
 * write), so each is validated by hand rather than cast. The shape is pinned by
 * `tests/fixtures/embed-info.sample.json`, which the bridge tests assert too.
 */

import { safeAspect } from "./embedPolicy";
import { safeHttpUrl } from "./embedUrlGuard";
import type { ProviderEmbed } from "./embedKit";

export const EMBED_KINDS = ["video", "audio", "rich", "photo", "file", "link"] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

export interface EmbedInfo {
  url: string;
  kind: EmbedKind;
  provider: string | null;
  title: string;
  description: string;
  siteName: string;
  /** Absolute http(s) URL, or "" when there is none. */
  image: string;
  favicon: string;
  player: { src: string; aspect: string } | null;
  media: { src: string; mime: string } | null;
  frameable: boolean | null;
}

export type EmbedSnapshot = EmbedInfo & { resolvedAt: string };

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 500;
const MAX_NAME = 100;
const MAX_MIME = 100;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const MAX_TIMESTAMP = 40;
const MIME_SHAPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function link(value: unknown): string {
  return typeof value === "string" ? safeHttpUrl(value) : "";
}

function parsePlayer(value: unknown): EmbedInfo["player"] {
  if (!isDict(value)) return null;
  const src = link(value["src"]);
  return src === "" ? null : { src, aspect: safeAspect(value["aspect"]) };
}

function parseMedia(value: unknown): EmbedInfo["media"] {
  if (!isDict(value)) return null;
  const src = link(value["src"]);
  const mime = text(value["mime"], MAX_MIME);
  return src === "" || !MIME_SHAPE.test(mime) ? null : { src, mime };
}

function parseKind(value: unknown): EmbedKind | null {
  return EMBED_KINDS.find((kind) => kind === value) ?? null;
}

/** A validated, sanitised EmbedInfo, or null when it is not one: not an object,
 *  an unknown `kind`, or a `url` that is not a safe http(s) URL. Text is
 *  truncated, every other URL field is blanked (or nulled) when unsafe, the
 *  aspect is clamped. Unknown properties are dropped. */
export function parseEmbedInfo(value: unknown): EmbedInfo | null {
  if (!isDict(value)) return null;
  const kind = parseKind(value["kind"]);
  const url = link(value["url"]);
  if (kind === null || url === "") return null;
  const provider = text(value["provider"], MAX_NAME);
  return {
    url,
    kind,
    provider: provider === "" ? null : provider,
    title: text(value["title"], MAX_TITLE),
    description: text(value["description"], MAX_DESCRIPTION),
    siteName: text(value["siteName"], MAX_NAME),
    image: link(value["image"]),
    favicon: link(value["favicon"]),
    player: parsePlayer(value["player"]),
    media: parseMedia(value["media"]),
    frameable: typeof value["frameable"] === "boolean" ? value["frameable"] : null,
  };
}

function jsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}

/** As `parseEmbedInfo`, plus `resolvedAt` (an ISO-parsable timestamp), and
 *  refuses anything whose JSON exceeds 64 KB: a collaborator can put any block
 *  JSON in a shared page. */
export function parseEmbedSnapshot(value: unknown): EmbedSnapshot | null {
  if (!isDict(value) || jsonBytes(value) > MAX_SNAPSHOT_BYTES) return null;
  const info = parseEmbedInfo(value);
  const resolvedAt = text(value["resolvedAt"], MAX_TIMESTAMP);
  if (info === null || resolvedAt === "" || Number.isNaN(Date.parse(resolvedAt))) return null;
  return { ...info, resolvedAt };
}

/** An offline snapshot built from the provider table alone (no network). */
export function embedInfoFromProvider(url: string, embed: ProviderEmbed): EmbedInfo {
  return {
    url: safeHttpUrl(url),
    kind: embed.kind,
    provider: embed.provider,
    title: "",
    description: "",
    siteName: embed.provider,
    image: embed.thumb === undefined ? "" : safeHttpUrl(embed.thumb),
    favicon: "",
    player: { src: embed.src, aspect: embed.aspect },
    media: null,
    frameable: embed.frameable ?? true,
  };
}
