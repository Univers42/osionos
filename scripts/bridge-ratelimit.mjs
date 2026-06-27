/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-ratelimit.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * In-memory token-bucket rate limiter for the SINGLE-PROCESS osionos bridge.
 * No Redis client is wired into the bridge (Node built-ins only), so a
 * module-level Map is the right tool for one instance — mirrors the
 * `pruneExpiringMap` idiom in bridge-api.mjs. If the bridge is ever scaled
 * horizontally, swapping this Map for a shared Redis bucket is the ONLY change
 * needed; the call sites stay identical.
 */

import { httpError } from './bridge-social-core.mjs';

const buckets = new Map(); // key -> { tokens, updatedAt }
const PRUNE_AFTER_MS = 5 * 60_000;
let opsSincePrune = 0;

/** Drop idle buckets so a long-lived process doesn't accumulate them forever. */
function maybePrune(now) {
	if (++opsSincePrune < 500) return;
	opsSincePrune = 0;
	for (const [key, bucket] of buckets.entries()) {
		if (now - bucket.updatedAt > PRUNE_AFTER_MS) buckets.delete(key);
	}
}

/**
 * Consume one token from `key`'s bucket; throw 429 when it is empty.
 * `capacity` is the burst size, `refillPerSec` the steady-state rate.
 */
export function takeToken(key, { capacity, refillPerSec, now = Date.now() }) {
	maybePrune(now);
	let bucket = buckets.get(key);
	if (!bucket) { bucket = { tokens: capacity, updatedAt: now }; buckets.set(key, bucket); }
	const elapsedSec = Math.max(0, now - bucket.updatedAt) / 1000;
	bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
	bucket.updatedAt = now;
	if (bucket.tokens < 1) {
		const retrySec = Math.ceil((1 - bucket.tokens) / refillPerSec);
		throw httpError(`Too many requests — slow down and retry in ${retrySec}s.`, 429);
	}
	bucket.tokens -= 1;
	return true;
}
