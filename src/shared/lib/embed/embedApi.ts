/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Resolving a link into an EmbedInfo, only when called: nothing here runs on
 * paste, a caller invokes it after the user picks Bookmark, Embed or Mention.
 *
 * Order: guard the URL; provider table (instant, offline); otherwise the
 * bridge; otherwise a hostname-only link card. A provider match is enriched
 * with the bridge's title/description/image when it answers in time.
 *
 * The transport is injected so tests never touch the network, and so this
 * module imports nothing that needs a browser; `embedBridge.ts` binds it to
 * the real api client.
 */

import { embedInfoFromProvider, parseEmbedInfo, type EmbedInfo } from "./embedInfo";
import { resolveProviderEmbed } from "./embedProviders";
import { displayHost, safeHttpUrl } from "./embedUrlGuard";

export class EmbedUrlError extends Error {
  constructor(input: string) {
    super(`not an embeddable http(s) URL: ${input.slice(0, 80)}`);
    this.name = "EmbedUrlError";
  }
}

export interface EmbedTransport {
  /** False when there is no bridge to ask (no `VITE_API_URL`). */
  isAvailable(): boolean;
  /** The raw bridge reply `{ embed }`; rejects on any failure. */
  resolve(url: string): Promise<unknown>;
}

export interface ResolveOptions {
  /** How long a provider match waits for the bridge's enrichment. */
  enrichTimeoutMs?: number;
}

const CACHE_LIMIT = 200;
const DEFAULT_ENRICH_TIMEOUT_MS = 4000;

type Settled = { info: EmbedInfo; cacheable: boolean };

/** Caveat: keyed by URL only (not user or transport), evicts oldest-first
 *  (FIFO, not LRU), and lives for the page session, so a changed page or a
 *  recovered bridge is not seen until reload. Degraded results are not cached. */
const cache = new Map<string, Promise<EmbedInfo>>();

export function clearEmbedCache(): void {
  cache.clear();
}

/** A pasted `youtu.be/x` has no scheme; add one unless it already carries one. */
function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return safeHttpUrl(trimmed);
  return safeHttpUrl(`https://${trimmed}`);
}

function degraded(url: string): EmbedInfo {
  const host = displayHost(url);
  return {
    url, kind: "link", provider: null, title: host, description: "", siteName: host,
    image: "", favicon: "", player: null, media: null, frameable: null,
  };
}

function embedField(reply: unknown): unknown {
  return typeof reply === "object" && reply !== null ? (reply as Record<string, unknown>)["embed"] : undefined;
}

async function askBridge(url: string, transport: EmbedTransport): Promise<EmbedInfo | null> {
  if (!transport.isAvailable()) return null;
  try {
    return parseEmbedInfo(embedField(await transport.resolve(url)));
  } catch {
    return null;
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function enrich(base: EmbedInfo, bridge: EmbedInfo | null): EmbedInfo {
  if (bridge === null) return base;
  return {
    ...base,
    title: bridge.title,
    description: bridge.description,
    siteName: bridge.siteName === "" ? base.siteName : bridge.siteName,
    image: bridge.image === "" ? base.image : bridge.image,
    favicon: bridge.favicon,
  };
}

async function resolveUncached(url: string, transport: EmbedTransport, options: ResolveOptions): Promise<Settled> {
  const provider = resolveProviderEmbed(url);
  if (provider !== null) {
    const base = embedInfoFromProvider(url, provider);
    const timeout = options.enrichTimeoutMs ?? DEFAULT_ENRICH_TIMEOUT_MS;
    const bridge = await withTimeout(askBridge(url, transport), timeout, null);
    return { info: enrich(base, bridge), cacheable: true };
  }
  const bridge = await askBridge(url, transport);
  return bridge === null ? { info: degraded(url), cacheable: false } : { info: bridge, cacheable: true };
}

/** Resolve `rawUrl`. Rejects with `EmbedUrlError` only for an unsafe URL; any
 *  bridge failure degrades to a hostname-only `kind:'link'` result. */
export function createEmbedResolver(transport: EmbedTransport, options: ResolveOptions = {}) {
  return function resolveEmbed(rawUrl: string): Promise<EmbedInfo> {
    const url = normalizeInput(rawUrl);
    if (url === "") return Promise.reject(new EmbedUrlError(rawUrl));
    const hit = cache.get(url);
    if (hit !== undefined) return hit;
    const pending = resolveUncached(url, transport, options).then((settled) => {
      if (!settled.cacheable) cache.delete(url);
      return settled.info;
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(url, pending);
    return pending;
  };
}
