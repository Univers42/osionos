/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConfigBudget.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageConfig } from './pageConfigStore';

/**
 * How big a page config may be when it is sent to the server.
 *
 * Version snapshots are local-only: nothing read them back (the version panel reads
 * the browser's own store, and the bridge replaces the whole config column on every
 * PATCH) while carrying up to ten of them made the WAF in front of PostgREST
 * (grobase ModSecurity) refuse 119 of 215 config saves on 2026-10-27 — so `versions`
 * never leaves the browser (memory + localStorage).
 * Caveat: a config whose settings and translations alone exceed the WAF edge
 * (1000 leaves / 128 KiB) is still refused there; none measured on 2026-10-27
 * (largest: 29 leaves of settings, 172 of translations).
 */

/** The bridge refuses a bigger page body with a 413, which drops the whole PATCH. */
const BRIDGE_MAX_BYTES = 5_000_000;

/** The config as it is sent to the server: every field of a page config but the local-only `versions`. */
export type ApiPageConfig = Omit<PageConfig, 'versions'>;

function byteSize(value: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length;
}

function fitsBridge(config: ApiPageConfig): boolean {
  return byteSize(JSON.stringify(config)) <= BRIDGE_MAX_BYTES;
}

/**
 * The config as it may be sent: `versions` dropped (they are local-only), then
 * translation content shed only past the bridge's limit. The in-memory and the
 * localStorage copies keep everything; nothing in the web app reads the server
 * copy back.
 */
export function shrinkConfigForApi({ versions: _versions, ...config }: PageConfig): ApiPageConfig {
  if (fitsBridge(config)) return config;
  const activeId = config.activeTranslation?.id;
  const keepActive: ApiPageConfig = {
    ...config,
    translations: config.translations.map((t) => (t.id === activeId ? t : { ...t, content: [] })),
  };
  if (fitsBridge(keepActive)) return keepActive;
  return { ...keepActive, translations: keepActive.translations.map((t) => ({ ...t, content: [] })) };
}
