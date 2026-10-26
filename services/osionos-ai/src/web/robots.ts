import { capBody } from '../connections/bodyCap.ts';
import type { GuardedFetch } from '../connections/endpointGuard.ts';
import { WebFailure } from './failure.ts';
import { decodeBody, isRedirect, readBytes, ROBOTS_ACCEPT, sendRequest } from './wire.ts';
import { webUrl } from './webUrl.ts';

/**
 * robots.txt, RFC 9309 (web C366): the sites' say in whether an assistant reads
 * them. The page fetcher asks here for the final URL of every hop.
 *
 * Matching: the group whose `User-agent` is our product token
 * `osionos-assistant` (case-insensitive, every such group merged), else the
 * `*` groups. Inside it the longest matching pattern wins, `Allow` wins a
 * tie, `*` matches any run and a final `$` anchors the end. No match = allowed.
 *
 * Fetching: `/robots.txt` of the same origin, through the same guarded fetch,
 * inside the page's deadline and its own 5 s, capped at 64 KiB, following
 * same-origin redirects only. Being unsure means NO: a 4xx (the site has no
 * robots.txt) allows everything; a 5xx, a 429, a timeout, an oversized or
 * unparseable file, a cross-origin redirect or any network error disallows.
 * Every outcome is cached for an hour per origin, the refusals too, so a
 * site that errors is not asked again for each page.
 *
 * Caveat: percent-encoding is not normalised (a pattern `/a%2Fb` does not
 * match `/a/b`), `Crawl-delay` and `Sitemap` are ignored, and "unparseable"
 * means a body that is HTML or has no `field: value` line at all, so a
 * robots.txt that is garbled but contains one valid line is trusted. A
 * cached 5xx can keep a recovered site disallowed for up to an hour. A site
 * with a www redirect (cross-origin) is disallowed, never guessed.
 */

export const ROBOTS_TIMEOUT_MS = 5_000;
export const ROBOTS_MAX_BYTES = 64 * 1024;
export const ROBOTS_TTL_MS = 3_600_000;
export const ROBOTS_MAX_ORIGINS = 1000;
const MAX_ROBOTS_REDIRECTS = 3;
const USER_AGENT_TOKEN = 'osionos-assistant';

export interface RobotsPolicy {
	/** `target` is the path and the query of the URL. */
	allows(target: string): boolean;
}

interface Rule {
	allow: boolean;
	pattern: string;
}

const ALLOW_ALL: RobotsPolicy = { allows: () => true };
const DISALLOW_ALL: RobotsPolicy = { allows: () => false };
export const ROBOTS_ALLOW_ALL = ALLOW_ALL;
export const ROBOTS_DISALLOW_ALL = DISALLOW_ALL;

/** Whether a robots pattern (`*` and a final `$`) matches the start of a path. */
export function patternMatches(pattern: string, target: string): boolean {
	const anchored = pattern.endsWith('$');
	const parts = (anchored ? pattern.slice(0, -1) : pattern).split('*');
	if (!target.startsWith(parts[0])) return false;
	if (parts.length === 1) return anchored ? target === parts[0] : true;
	let position = parts[0].length;
	for (let index = 1; index < parts.length; index += 1) {
		const part = parts[index];
		if (anchored && index === parts.length - 1) {
			return target.length - part.length >= position && target.endsWith(part);
		}
		const found = target.indexOf(part, position);
		if (found < 0) return false;
		position = found + part.length;
	}
	return true;
}

function policyOf(rules: readonly Rule[]): RobotsPolicy {
	return {
		allows(target) {
			let best: Rule | null = null;
			for (const rule of rules) {
				if (!patternMatches(rule.pattern, target)) continue;
				const longer = !best || rule.pattern.length > best.pattern.length;
				const tieForAllow = best !== null && rule.pattern.length === best.pattern.length && rule.allow && !best.allow;
				if (longer || tieForAllow) best = rule;
			}
			return best ? best.allow : true;
		},
	};
}

/** The policy for our token, or null when the text is not a robots.txt. */
export function parseRobots(text: string): RobotsPolicy | null {
	const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	if (body.trimStart().startsWith('<')) return null;
	const groups: { agents: string[]; rules: Rule[] }[] = [];
	let current: { agents: string[]; rules: Rule[] } | null = null;
	let extendable = false;
	let recognised = 0;
	let content = 0;
	for (const rawLine of body.split(/\r\n|\r|\n/)) {
		const hash = rawLine.indexOf('#');
		const line = (hash < 0 ? rawLine : rawLine.slice(0, hash)).trim();
		if (!line) continue;
		content += 1;
		const colon = line.indexOf(':');
		const field = colon < 0 ? '' : line.slice(0, colon).trim().toLowerCase();
		if (!/^[a-z][a-z-]*$/.test(field)) continue;
		recognised += 1;
		const value = line.slice(colon + 1).trim();
		if (field === 'user-agent') {
			if (!current || !extendable) {
				current = { agents: [], rules: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
			extendable = true;
		} else if (field === 'allow' || field === 'disallow') {
			extendable = false;
			// An empty Disallow means "nothing is off limits"; an empty Allow says nothing.
			if (current && value) current.rules.push({ allow: field === 'allow', pattern: value });
		}
	}
	if (content > 0 && recognised === 0) return null;
	const named = groups.filter((group) => group.agents.includes(USER_AGENT_TOKEN));
	const chosen = named.length > 0 ? named : groups.filter((group) => group.agents.includes('*'));
	return policyOf(chosen.flatMap((group) => group.rules));
}

/** The policies by origin: an LRU with a TTL, in this process only. */
export class RobotsCache {
	private readonly entries = new Map<string, { policy: RobotsPolicy; expires: number }>();

	private readonly now: () => number;
	private readonly ttlMs: number;
	private readonly maxOrigins: number;

	constructor(now: () => number = Date.now, ttlMs = ROBOTS_TTL_MS, maxOrigins = ROBOTS_MAX_ORIGINS) {
		this.now = now;
		this.ttlMs = ttlMs;
		this.maxOrigins = maxOrigins;
	}

	get size(): number {
		return this.entries.size;
	}

	get(origin: string): RobotsPolicy | undefined {
		const entry = this.entries.get(origin);
		if (!entry) return undefined;
		this.entries.delete(origin);
		if (entry.expires <= this.now()) return undefined;
		this.entries.set(origin, entry);
		return entry.policy;
	}

	set(origin: string, policy: RobotsPolicy): void {
		this.entries.delete(origin);
		this.entries.set(origin, { policy, expires: this.now() + this.ttlMs });
		while (this.entries.size > this.maxOrigins) {
			const oldest = this.entries.keys().next().value as string;
			this.entries.delete(oldest);
		}
	}
}

export const defaultRobotsCache = new RobotsCache();

export interface RobotsContext {
	fetchImpl: GuardedFetch;
	cache: RobotsCache;
	/** The page's deadline: when it fires the failure is a timeout, not a refusal. */
	signal: AbortSignal;
	beforeRequest?: (kind: 'robots' | 'page') => void | Promise<void>;
	timeoutMs?: number;
}

/** What the site says, or the refusal that stands in for "could not find out". */
async function loadPolicy(origin: string, context: RobotsContext): Promise<RobotsPolicy> {
	const signal = AbortSignal.any([context.signal, AbortSignal.timeout(context.timeoutMs ?? ROBOTS_TIMEOUT_MS)]);
	let target = new URL('/robots.txt', origin);
	for (let hop = 0; hop <= MAX_ROBOTS_REDIRECTS; hop += 1) {
		// Outside the try: a rate limit of the caller is its failure, not a site's.
		await context.beforeRequest?.('robots');
		let response: Response | undefined;
		try {
			response = await sendRequest(context.fetchImpl, target, ROBOTS_ACCEPT, signal);
			if (isRedirect(response.status)) {
				const location = response.headers.get('location');
				const next = location ? webUrl(new URL(location, target).href) : null;
				if (!next || next.origin !== origin) return DISALLOW_ALL;
				target = next;
				continue;
			}
			if (response.status >= 200 && response.status < 300) {
				const capped = capBody(response, ROBOTS_MAX_BYTES, () => undefined);
				return parseRobots(decodeBody(await readBytes(capped.body), 'utf-8')) ?? DISALLOW_ALL;
			}
			return response.status >= 400 && response.status < 500 && response.status !== 429 ? ALLOW_ALL : DISALLOW_ALL;
		} catch (error) {
			// The page's own deadline or the caller's abort: not the site's refusal.
			if (context.signal.aborted) throw error;
			return DISALLOW_ALL;
		} finally {
			void response?.body?.cancel().catch(() => undefined);
		}
	}
	return DISALLOW_ALL;
}

/** Throws `web_robots_disallowed` unless the site lets us read this URL. */
export async function checkRobots(url: URL, context: RobotsContext): Promise<void> {
	let policy = context.cache.get(url.origin);
	if (!policy) {
		policy = await loadPolicy(url.origin, context);
		context.cache.set(url.origin, policy);
	}
	if (!policy.allows(url.pathname + url.search)) throw new WebFailure('web_robots_disallowed');
}
