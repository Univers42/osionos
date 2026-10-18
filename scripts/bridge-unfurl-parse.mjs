/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-parse.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Turns fetched bytes into the `EmbedInfo` the client renders (shape pinned by
 * tests/fixtures/embed-info.sample.json). Pure functions, no I/O.
 *
 * Nothing from a remote page is passed through verbatim: text fields are capped,
 * URL fields are re-parsed and kept only when absolute http(s) without userinfo,
 * and oEmbed `html` is never returned, only the `src` of its first <iframe>.
 *
 * Caveat: HTML is read by a bounded tag scan over the document head only (up to
 * `</head>` or 64 KB), not a real parser. Tags past that, tags built by script,
 * tags longer than 1024 chars, and a `>` inside an unquoted attribute are missed
 * (under-reporting: the card falls back to fewer fields). Charset is
 * taken from the Content-Type header only, so a page declaring its charset in a
 * <meta> tag can show mojibake. Frameability reads response headers only: a
 * `frame-ancestors` list that names this app's origin is reported as not
 * frameable, and a site that blocks framing in script is reported as frameable.
 */

import { absoluteHttpUrl, cleanText, documentHead, tagsNamed, titleOf } from './bridge-unfurl-scan.mjs';

export { absoluteHttpUrl, documentHead };

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
export const CAPS = Object.freeze({ title: 300, description: 500, siteName: 100, provider: 100 });

function greatestCommonDivisor(a, b) {
	while (b !== 0) [a, b] = [b, a % b];
	return a;
}

/** "w/h" from pixel sizes, reduced; "16/9" when missing or out of the 4-digit range. */
export function aspectOf(width, height) {
	const w = Math.round(Number(width));
	const h = Math.round(Number(height));
	if (!(w >= 1 && h >= 1 && w <= 16_384 && h <= 16_384)) return '16/9';
	const divisor = greatestCommonDivisor(w, h);
	return w / divisor > 9999 || h / divisor > 9999 ? '16/9' : `${w / divisor}/${h / divisor}`;
}

function metaMap(html) {
	const metas = new Map();
	for (const tag of tagsNamed(html, 'meta')) {
		for (const key of [tag.property, tag.name]) {
			const name = key?.trim().toLowerCase();
			if (name && tag.content !== undefined && !metas.has(name)) metas.set(name, tag.content);
		}
	}
	return metas;
}

const firstMeta = (metas, ...names) => names.map((name) => metas.get(name)).find((value) => value) ?? '';

function playerFromMeta(metas, base) {
	const ogSrc = absoluteHttpUrl(firstMeta(metas, 'og:video:secure_url', 'og:video:url', 'og:video'), base);
	if (ogSrc && /^text\/html\b/i.test(metas.get('og:video:type') ?? '')) {
		return { src: ogSrc, aspect: aspectOf(metas.get('og:video:width'), metas.get('og:video:height')) };
	}
	const twitterSrc = absoluteHttpUrl(metas.get('twitter:player'), base);
	return twitterSrc ? { src: twitterSrc, aspect: aspectOf(metas.get('twitter:player:width'), metas.get('twitter:player:height')) } : null;
}

function linkHref(html, base, matches) {
	const link = tagsNamed(html, 'link').find((tag) => tag.href && matches(tag));
	return link ? absoluteHttpUrl(link.href, base) : null;
}

const relTokens = (tag) => (tag.rel ?? '').toLowerCase().split(/\s+/);

/** Everything the HTML itself says: text, image, favicon, player, oEmbed endpoint. `base` is the final URL. */
export function extractPage(fullHtml, base) {
	const html = documentHead(fullHtml);
	const metas = metaMap(html);
	const origin = new URL(base).origin;
	return {
		title: cleanText(firstMeta(metas, 'og:title', 'twitter:title') || titleOf(html), CAPS.title),
		description: cleanText(firstMeta(metas, 'og:description', 'twitter:description', 'description'), CAPS.description),
		siteName: cleanText(metas.get('og:site_name'), CAPS.siteName),
		image: absoluteHttpUrl(firstMeta(metas, 'og:image', 'twitter:image'), base),
		favicon: linkHref(html, base, (tag) => relTokens(tag).includes('icon')) ?? `${origin}/favicon.ico`,
		player: playerFromMeta(metas, base),
		oembedHref: linkHref(html, base, (tag) => relTokens(tag).includes('alternate') && (tag.type ?? '').toLowerCase() === 'application/json+oembed'),
	};
}

/** oEmbed JSON to the few fields we use; `html` contributes only its first iframe `src`. */
export function parseOembed(text, endpoint) {
	let data;
	try { data = JSON.parse(text); } catch { return null; }
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const iframe = typeof data.html === 'string' ? tagsNamed(data.html.slice(0, 65_536), 'iframe')[0] : undefined;
	const src = absoluteHttpUrl(iframe?.src, endpoint);
	return {
		kind: ['video', 'photo', 'rich', 'link'].includes(data.type) ? data.type : 'link',
		title: cleanText(data.title, CAPS.title),
		provider: cleanText(data.provider_name, CAPS.provider) || null,
		image: absoluteHttpUrl(data.thumbnail_url, endpoint),
		photo: data.type === 'photo' ? absoluteHttpUrl(data.url, endpoint) : null,
		player: src ? { src, aspect: aspectOf(data.width, data.height) } : null,
	};
}

/** true / false from the FINAL page response headers (X-Frame-Options, CSP frame-ancestors). */
export function frameableFrom(headers) {
	if (/\b(?:deny|sameorigin)\b/i.test(String(headers['x-frame-options'] ?? ''))) return false;
	for (const policy of String(headers['content-security-policy'] ?? '').split(',')) {
		for (const directive of policy.split(';')) {
			const [name, ...sources] = directive.trim().split(/\s+/);
			if (name.toLowerCase() === 'frame-ancestors' && !sources.includes('*')) return false;
		}
	}
	return true;
}

export function contentTypeOf(headers) {
	return String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
}

/** 'video' | 'audio' | 'photo' | 'file' for directly addressable media, else null. */
export function mediaKindOf(mime) {
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime.startsWith('image/')) return 'photo';
	return mime === 'application/pdf' ? 'file' : null;
}

/** The one place that enforces EmbedInfo's field types and caps. */
export function shapeEmbedInfo(url, fields) {
	const player = fields.player ? { src: absoluteHttpUrl(fields.player.src), aspect: /^\d{1,4}\/\d{1,4}$/.test(fields.player.aspect) ? fields.player.aspect : '16/9' } : null;
	const mime = fields.media?.mime && MIME_PATTERN.test(fields.media.mime) ? fields.media.mime.slice(0, 100) : null;
	const mediaSrc = absoluteHttpUrl(fields.media?.src);
	return {
		url,
		kind: fields.kind ?? 'link',
		provider: fields.provider ? cleanText(fields.provider, CAPS.provider) || null : null,
		title: cleanText(fields.title, CAPS.title),
		description: cleanText(fields.description, CAPS.description),
		siteName: cleanText(fields.siteName, CAPS.siteName),
		image: absoluteHttpUrl(fields.image),
		favicon: absoluteHttpUrl(fields.favicon),
		player: player?.src ? player : null,
		media: mediaSrc && mime ? { src: mediaSrc, mime } : null,
		frameable: typeof fields.frameable === 'boolean' ? fields.frameable : null,
	};
}

/** Merge page metadata with optional oEmbed data; the page wins for text so chat previews stay stable. */
export function composeEmbedInfo(url, page, oembed, frameable) {
	const player = oembed?.player ?? page.player;
	let kind = 'link';
	if (player) kind = !oembed?.player || oembed.kind === 'video' ? 'video' : 'rich';
	else if (oembed?.kind === 'photo' && oembed.photo) kind = 'photo';
	return shapeEmbedInfo(url, {
		kind,
		provider: oembed?.provider,
		title: page.title || oembed?.title,
		description: page.description,
		siteName: page.siteName || oembed?.provider,
		image: page.image ?? oembed?.image ?? oembed?.photo,
		favicon: page.favicon,
		player,
		frameable,
	});
}
