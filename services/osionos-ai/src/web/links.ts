import { webUrl } from './webUrl.ts';

/**
 * The links a page offers the model as next steps (web C348).
 *
 * They are leads, not permission: each one is resolved against the URL the
 * page was actually served from (a `<base>` tag is never read, it is the
 * page's way to point a relative link anywhere) and must pass the same
 * `webUrl()` gate as a URL the model typed, so a `javascript:`, `data:`,
 * `http:`, credentialed, literal-address or internal-name link never reaches
 * the model as something to fetch. Fetching one still goes through the fetcher.
 *
 * Caveat: this is the page's own claim of where a link goes; a link with a
 * public name may still resolve to a private address, which the guarded lookup
 * refuses at connect time, not here.
 */
export const MAX_LINKS = 30;

/** Up to MAX_LINKS distinct, canonical https links, in document order. */
export function extractLinks(hrefs: readonly string[], finalUrl: string): string[] {
	let base: URL;
	try {
		base = new URL(finalUrl);
	} catch {
		return [];
	}
	const links = new Set<string>();
	for (const href of hrefs) {
		if (links.size >= MAX_LINKS) break;
		const target = href.trim();
		// An empty href is the page itself, not a lead.
		if (!target) continue;
		let resolved: URL;
		try {
			resolved = new URL(target, base);
		} catch {
			continue;
		}
		const allowed = webUrl(resolved.href);
		if (allowed) links.add(allowed.href);
	}
	return [...links];
}
