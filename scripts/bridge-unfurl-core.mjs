/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-core.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Link unfurling: URL in, `EmbedInfo` out. Owns the cache, the process-wide
 * concurrency limit and the per-user rate bucket; the network guard lives in
 * bridge-unfurl-net.mjs and the HTML/oEmbed parsing in bridge-unfurl-parse.mjs.
 * The only provider table is the oEmbed endpoint list in bridge-unfurl-oembed.mjs;
 * the client resolves players itself and asks the bridge for titles and images.
 *
 * Resolution order: direct media by Content-Type, then oEmbed discovery, then
 * og:video / twitter:player, then Open Graph / <title>.
 *
 * Caveat: the cache is per process and keyed by URL (fragment dropped), so it is
 * lost on restart and a site that changes its metadata or framing policy keeps
 * the old answer for up to 24 h (10 min for failures). Failures are cached by
 * kind, so a transient outage hides a recovered site for those 10 minutes. The
 * rate bucket and the in-flight counter are per process, not per fleet.
 */

import { takeToken } from './bridge-ratelimit.mjs';
import {
	createFetchContext,
	parseTargetUrl,
	safeFetch,
	unfurlError,
} from './bridge-unfurl-net.mjs';
import { oembedEndpointFor } from './bridge-unfurl-oembed.mjs';
import {
	composeEmbedInfo,
	contentTypeOf,
	extractPage,
	frameableFrom,
	mediaKindOf,
	parseOembed,
	shapeEmbedInfo,
} from './bridge-unfurl-parse.mjs';

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const CACHE_ENTRIES = 500;
const MAX_IN_FLIGHT = 8;
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const isSuccess = (status) => status >= 200 && status < 300;

// One bucket shared by /api/embed/resolve and /api/chat/link-preview: 20 covers
// a page full of pasted links, 0.5/s (30/min) is above human pasting and below
// what turns the bridge into a scanner.
const UNFURL_BUCKET = { capacity: 20, refillPerSec: 0.5 };

// Webhooks are user-configured automations, not pasted links: a burst of 10 covers
// a rule firing on a bulk edit, 0.2/s (12/min) stops a loop from using the bridge
// as a relay. Separate from the unfurl bucket so one cannot starve the other.
const WEBHOOK_BUCKET = { capacity: 10, refillPerSec: 0.2 };

/** Charge one outbound webhook to the user; throws 429 when their bucket is empty. */
export function admitWebhook(userId) {
	takeToken(`webhook:${userId}`, WEBHOOK_BUCKET);
}

/** Charge one outbound lookup to the user; throws 429 when their bucket is empty. */
export function admitUnfurl(userId) {
	takeToken(`unfurl:${userId}`, UNFURL_BUCKET);
}

function decodeBody(body, contentType) {
	const label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
	try { return new TextDecoder(label).decode(body); } catch { return new TextDecoder().decode(body); }
}

async function fetchOembed(href, ctx) {
	try {
		const reply = await safeFetch(href, {
			headers: { accept: 'application/json' },
			wantBody: (status, headers) => isSuccess(status) && contentTypeOf(headers).includes('json'),
		}, ctx);
		return reply.body ? parseOembed(decodeBody(reply.body, ''), reply.url.href) : null;
	} catch {
		return null;
	}
}

const NO_PAGE = Object.freeze({ title: '', description: '', siteName: '', image: null, player: null });

// Known providers first: their pages are unscannable (see bridge-unfurl-oembed.mjs).
// A null answer falls through to the ordinary page fetch.
async function fetchKnownOembed(url, ctx) {
	const endpoint = oembedEndpointFor(url);
	const oembed = endpoint ? await fetchOembed(endpoint, ctx) : null;
	if (!oembed) return null;
	return composeEmbedInfo(url.href, { ...NO_PAGE, favicon: `${url.origin}/favicon.ico` }, oembed, null);
}

async function fetchEmbed(url, ctx) {
	const known = await fetchKnownOembed(url, ctx);
	if (known) return known;
	const page = await safeFetch(url.href, {
		headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
		wantBody: (status, headers) => isSuccess(status) && HTML_TYPES.has(contentTypeOf(headers)),
	}, ctx);
	if (!isSuccess(page.status)) throw unfurlError('unreachable');
	const mime = contentTypeOf(page.headers);
	const mediaKind = mediaKindOf(mime);
	if (mediaKind) {
		return shapeEmbedInfo(url.href, { kind: mediaKind, media: { src: page.url.href, mime }, image: mediaKind === 'photo' ? page.url.href : null });
	}
	if (!page.body) return shapeEmbedInfo(url.href, { kind: 'link' });
	const parsed = extractPage(decodeBody(page.body, page.headers['content-type'] ?? ''), page.url.href);
	const oembed = parsed.oembedHref ? await fetchOembed(parsed.oembedHref, ctx) : null;
	return composeEmbedInfo(url.href, parsed, oembed, frameableFrom(page.headers));
}

/**
 * Build an unfurler. `netOptions` are the test seams of createFetchContext
 * (resolveHost, isBlocked, allowedPorts, transports, limits).
 */
export function createUnfurler({ netOptions = {}, maxInFlight = MAX_IN_FLIGHT, now = Date.now } = {}) {
	const cache = new Map();
	let inFlight = 0;

	function remember(key, entry, ttlMs) {
		cache.delete(key);
		cache.set(key, { ...entry, expiresAt: now() + ttlMs });
		if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
	}

	function recall(key) {
		const entry = cache.get(key);
		if (!entry) return null;
		cache.delete(key);
		if (entry.expiresAt <= now()) return null;
		cache.set(key, entry);
		return entry;
	}

	// Shared by resolve and postJson so webhooks cannot bypass the process-wide cap.
	async function withSlot(task) {
		if (inFlight >= maxInFlight) throw unfurlError('busy');
		inFlight += 1;
		try {
			return await task();
		} finally {
			inFlight -= 1;
		}
	}

	async function resolve(rawUrl) {
		const url = parseTargetUrl(rawUrl, netOptions.allowedPorts);
		const requested = url.href;
		url.hash = '';
		const hit = recall(url.href);
		if (hit?.failure) throw unfurlError(hit.failure);
		if (hit) return { ...hit.embed, url: requested };
		try {
			const embed = await withSlot(() => fetchEmbed(url, createFetchContext(netOptions)));
			remember(url.href, { embed }, SUCCESS_TTL_MS);
			return { ...embed, url: requested };
		} catch (error) {
			const kind = error?.unfurlKind ?? 'unreachable';
			if (kind === 'busy') throw error;
			remember(url.href, { failure: kind }, FAILURE_TTL_MS);
			throw error?.unfurlKind ? error : unfurlError(kind);
		}
	}

	/** POST a JSON body without following redirects; resolves the upstream status, body discarded. */
	async function postJson(rawUrl, payload) {
		const ctx = createFetchContext({ ...netOptions, limits: { ...netOptions.limits, deadlineMs: 5000, requestMs: 5000 } });
		return withSlot(async () => (await safeFetch(rawUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			redirects: 0,
		}, ctx)).status);
	}

	return { resolve, postJson, cacheSize: () => cache.size };
}

export const defaultUnfurler = createUnfurler();
