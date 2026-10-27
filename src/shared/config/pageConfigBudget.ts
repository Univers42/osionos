/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConfigBudget.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageConfig } from './pageConfigStore';

/**
 * How big a page config may be when it is sent to the server.
 *
 * The bridge upserts the config as one PostgREST row, and the WAF in front of PostgREST
 * (grobase ModSecurity) refuses a JSON body of 1000 or more leaves (it reads each leaf as an
 * argument) or over 128 KiB. On 2026-10-27, 119 of 215 config saves in 3 h were refused that
 * way (b2b WAF log), so font, lock, width and translation changes on those pages were lost.
 * Every refused config carried ten full version snapshots; without them, all 313 live configs
 * fit (largest: 29 leaves of settings, 172 of translations). The budget keeps a margin for
 * the row's own fields (page_id, workspace_id, user_id, updated_at).
 */
const EDGE_MAX_LEAVES = 900;
const EDGE_MAX_BYTES = 120_000;

/** The bridge refuses a bigger page body with a 413, which drops the whole PATCH. */
const BRIDGE_MAX_BYTES = 5_000_000;

function byteSize(value: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length;
}

/**
 * The JSON leaves of `value` as the WAF counts arguments: every scalar, plus every empty
 * array or object. Stops counting at `limit`.
 * Caveat: counting an empty container may over-count by the few ModSecurity skips; that
 * only sheds a version early, never sends a body the edge refuses.
 */
export function jsonLeafCount(value: unknown, limit = Number.POSITIVE_INFINITY): number {
  let count = 0;
  const pending: unknown[] = [value];
  while (pending.length > 0 && count < limit) {
    const item = pending.pop();
    if (item === undefined) continue;
    if (item === null || typeof item !== 'object') {
      count += 1;
      continue;
    }
    const children = Array.isArray(item) ? item : Object.values(item);
    if (children.length === 0) count += 1;
    else for (const child of children) pending.push(child);
  }
  return count;
}

function fitsEdge(config: PageConfig): boolean {
  return byteSize(JSON.stringify(config)) <= EDGE_MAX_BYTES && jsonLeafCount(config, EDGE_MAX_LEAVES) < EDGE_MAX_LEAVES;
}

function fitsBridge(config: PageConfig): boolean {
  return byteSize(JSON.stringify(config)) <= BRIDGE_MAX_BYTES;
}

/**
 * The config as it may be sent: oldest version snapshots dropped until it fits the edge,
 * then translation content shed only past the bridge's limit. The in-memory and the
 * localStorage copies keep everything; nothing in the web app reads the server copy back.
 *
 * A version goes whole, never just its content: a version kept with `content: []`
 * restores as an empty page wherever it is loaded.
 * Caveat: a page whose settings and translations alone pass the edge is still refused
 * there (none on 2026-10-27); translation content is never shed for the edge, because an
 * emptied translation would overwrite the server's full one.
 */
export function shrinkConfigForApi(config: PageConfig): PageConfig {
  let next = config;
  // Versions are newest first, so the tail is the oldest.
  while (next.versions.length > 0 && !fitsEdge(next)) next = { ...next, versions: next.versions.slice(0, -1) };
  if (fitsBridge(next)) return next;
  const activeId = next.activeTranslation?.id;
  next = { ...next, translations: next.translations.map((t) => (t.id === activeId ? t : { ...t, content: [] })) };
  if (fitsBridge(next)) return next;
  return { ...next, translations: next.translations.map((t) => ({ ...t, content: [] })) };
}
