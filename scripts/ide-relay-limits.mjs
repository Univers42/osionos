// A sliding-window counter per key, with a peek. The pairing limits need "refuse before the
// lookup if this sub already failed 5 times": bridge-ratelimit's takeToken consumes on every call
// and cannot be asked first, and a limit that only fires after the guess was answered limits nothing.
//
// Caveat: state is per process, so a relay restart forgives every key (as takeToken's buckets do).
// Keys behind Funnel are global until the client IP is measured (contract U3): one caller can
// starve the rest, which is the safe direction.

export function createSlidingLimiter({ limit, windowMs, now = Date.now }) {
	const hits = new Map();
	const live = (key) => {
		const cutoff = now() - windowMs;
		const kept = (hits.get(key) ?? []).filter((at) => at > cutoff);
		if (kept.length > 0) hits.set(key, kept); else hits.delete(key);
		return kept;
	};
	const sweep = () => { for (const key of [...hits.keys()]) live(key); };
	return {
		peek: (key) => live(key).length < limit,
		record(key) { sweep(); hits.set(key, [...live(key), now()]); },
		take(key) {
			if (live(key).length >= limit) return false;
			this.record(key);
			return true;
		},
		get size() { return hits.size; },
	};
}
