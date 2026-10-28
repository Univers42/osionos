/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-map-cache.mjs                           :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The cross-request cache of one workspace's page parent map (parent-map-cache verdict
 * C700-C711). Every page surface reads `osionos_pages?select=id,parent_page_id[,owner_id,
 * visibility]` for the whole workspace: 1.49 of the 1.69 MB the share dialog reads on an
 * 8400-page workspace (c606 bench, dialog open p50 2.9 -> 23.3 ms on loopback).
 *
 * What it holds: the map only (id -> parent, and with `withMeta` id -> owner + visibility).
 * It is user-independent, read with the service key, and shared by every caller of the
 * workspace, so it is handed out frozen with its maps' writers removed. Membership, share
 * rules, teams and the caller's own entry are never cached: they stay per request.
 *
 * Rules, each load-bearing:
 * - Off unless PAGE_MAP_CACHE=1. PAGE_MAP_CACHE_TTL_MS is clamped to [0, 5000] ms (default
 *   2000); 0, or a value that is not a number, turns it off. Off, `get` is `load()`.
 * - Key: PostgREST base URL + lower-case workspace id + withMeta. A map read without meta
 *   never answers a request that needs it.
 * - The ticket (bridge-access-generation.mjs, workspace scope) is taken before the read and
 *   re-checked before the store, so a write that lands during the read prevents the store.
 *   A hit needs a live TTL AND a current ticket. A failed load stores nothing.
 * - Concurrent misses of one key share one read, but only while that read's ticket is
 *   current: a read begun before a bump may hold the old tree.
 *
 * Caveat: in process, the window is the gap between a page write landing and its bump (one
 * await): a request in that gap can still hit, or join, the map read before the write.
 * Out of process, the TTL (at most 5 s, counted from when the read landed) is the only
 * bound. Audited 2026-10-28: no runtime writer of parent_page_id, owner_id or visibility
 * runs outside the bridge. Realtime goes through the bridge routes, account erasure bumps
 * unscoped (bridge-account-erasure.mjs:186, 214), osionos_page_append writes content only
 * (bridge-api.mjs osionos_page_append), and
 * in groot those columns are written only by seeds, verify scripts and migrations
 * (scripts/seed-osionos-daily-driver.sql, scripts/verify/models-grants/account-checks.sql,
 * models/osionos-unowned-pages-backfill-migration.sql:97, models/osionos-account-erasure-
 * migration.sql:713-715). The FK cascade on parent_page_id (ON DELETE SET NULL,
 * models/osionos-bridge-migration.sql:52) fires only on a page delete, which the bridge
 * bumps. A hand-run SQL or a second bridge replica stays stale for up to the TTL.
 * Memory: capped at MAX_ENTRIES maps and MAX_TOTAL_PAGES pages; the oldest go first. An
 * 8400-page map with meta holds 3.25 MB of heap (node 22, 2026-10-28), so the page cap
 * bounds the cache near 39 MB.
 */

import { performance } from 'node:perf_hooks';
import { accessTicketWorkspace, ticketIsCurrent } from './bridge-access-generation.mjs';

export const TTL_CAP_MS = 5000;
export const DEFAULT_TTL_MS = 2000;
const MAX_ENTRIES = 64;
const MAX_TOTAL_PAGES = 100_000;

/** The effective TTL in ms; 0 means off. */
export function pageMapCacheTtlMs(env) {
	if (env?.PAGE_MAP_CACHE !== '1') return 0;
	const raw = env.PAGE_MAP_CACHE_TTL_MS;
	if (raw === undefined || raw === '') return DEFAULT_TTL_MS;
	const ttl = Number(raw);
	return Number.isFinite(ttl) ? Math.min(Math.max(Math.trunc(ttl), 0), TTL_CAP_MS) : 0;
}

const refuseWrite = () => {
	throw new TypeError('A cached page map is shared between requests and read-only.');
};

// Object.freeze does not stop Map#set, so the writers are shadowed on the instance.
function readOnly(map) {
	map.set = refuseWrite;
	map.delete = refuseWrite;
	map.clear = refuseWrite;
	return Object.freeze(map);
}

function freezeMap(result) {
	readOnly(result.parentOf);
	if (result.pageMeta) {
		for (const meta of result.pageMeta.values()) Object.freeze(meta);
		readOnly(result.pageMeta);
	}
	return Object.freeze(result);
}

export function createPageMapCache({ env = process.env, now = () => performance.now(), maxEntries = MAX_ENTRIES, maxTotalPages = MAX_TOTAL_PAGES } = {}) {
	const ttlMs = pageMapCacheTtlMs(env);
	const entries = new Map();
	const pending = new Map();
	let totalPages = 0;

	function drop(key) {
		const entry = entries.get(key);
		if (!entry) return;
		totalPages -= entry.pages;
		entries.delete(key);
	}

	// Insertion order is expiry order (one TTL for all), so the expired entries are a prefix.
	function remember(key, entry) {
		const current = now();
		drop(key);
		for (const [oldKey, old] of entries) {
			if (old.expiresAt > current && entries.size < maxEntries && totalPages + entry.pages <= maxTotalPages) break;
			drop(oldKey);
		}
		if (entry.pages > maxTotalPages) return;
		entries.set(key, entry);
		totalPages += entry.pages;
	}

	return {
		ttlMs,
		stats: () => ({ entries: entries.size, pages: totalPages, pending: pending.size }),
		/** `load` reads the map and throws to fail; its result is returned frozen when cached. */
		get({ baasUrl, workspaceId, withMeta }, load) {
			if (ttlMs === 0) return load();
			const key = `${baasUrl}|${String(workspaceId).toLowerCase()}|${withMeta ? 'meta' : 'plain'}`;
			const hit = entries.get(key);
			if (hit && hit.expiresAt > now() && ticketIsCurrent(hit.ticket)) return Promise.resolve(hit.result);
			drop(key);
			const running = pending.get(key);
			if (running && ticketIsCurrent(running.ticket)) return running.promise;
			const ticket = accessTicketWorkspace(workspaceId);
			const promise = Promise.resolve().then(load).then((result) => {
				const frozen = freezeMap(result);
				if (ticketIsCurrent(ticket)) remember(key, { expiresAt: now() + ttlMs, ticket, result: frozen, pages: frozen.parentOf.size });
				return frozen;
			});
			pending.set(key, { ticket, promise });
			promise.finally(() => {
				if (pending.get(key)?.promise === promise) pending.delete(key);
			}).catch(() => {});
			return promise;
		},
	};
}
