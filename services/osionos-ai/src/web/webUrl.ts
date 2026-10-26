import { isIPv4, isIPv6 } from 'node:net';
import { checkEndpointUrl } from '../connections/endpointGuard.ts';

/**
 * The URLs the web tools may reach (web C341): every fetch, every redirect hop,
 * every search result and every extracted link passes here.
 *
 * On top of the guard's own check (https, no credentials, no blocked literal):
 * the default port only, no literal address at all, and no name that only
 * means something inside a network (dotless, localhost, .local, .internal,
 * home.arpa). The fragment is dropped, never sent, so two URLs that differ by
 * it are one URL.
 *
 * Caveat: a public name may still resolve to a private address; the guarded
 * lookup refuses that at connect time, not this check.
 */
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** The canonical URL, fragment dropped, or null when the web tools never reach it. */
export function webUrl(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	url.hash = '';
	if (url.protocol !== 'https:' || url.port !== '') return null;
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	const bare = host.startsWith('[') ? host.slice(1, -1) : host;
	if (isIPv4(bare) || isIPv6(bare)) return null;
	if (!host.includes('.') || host === 'localhost') return null;
	if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1))) return null;
	try {
		checkEndpointUrl(url.href);
	} catch {
		return null;
	}
	return url;
}
