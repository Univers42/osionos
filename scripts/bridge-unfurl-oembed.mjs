/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-oembed.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Known oEmbed endpoints for hosts whose watch pages cannot be scanned: the YouTube
 * page is ~1.4 MB, so the 512 KB body cap cuts it off before its og tags or oEmbed
 * link, and TikTok / Dailymotion serve a generic page to bots (measured live).
 *
 * Endpoint hosts are constants here, never derived from the page being unfurled.
 *
 * Caveat: a provider that changes or retires its endpoint degrades silently to the
 * page scan (empty title, no image for YouTube). Matching is by host only, so a
 * path on a listed host that the provider cannot embed also falls back to the page.
 */

const ENDPOINTS = Object.freeze([
	{ hosts: ['youtube.com', 'youtu.be'], base: 'https://www.youtube.com/oembed?format=json&url=' },
	{ hosts: ['vimeo.com'], base: 'https://vimeo.com/api/oembed.json?url=' },
	{ hosts: ['tiktok.com'], base: 'https://www.tiktok.com/oembed?url=' },
	{ hosts: ['dailymotion.com', 'dai.ly'], base: 'https://www.dailymotion.com/services/oembed?format=json&url=' },
]);

/** Exact host or dot-suffix, so `evilyoutube.com` and `youtube.com.evil.example` never match. */
const matches = (host, known) => host === known || host.endsWith(`.${known}`);

/** oEmbed endpoint URL for `url` (a URL object), or null when its host is not listed. */
export function oembedEndpointFor(url) {
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	const entry = ENDPOINTS.find(({ hosts }) => hosts.some((known) => matches(host, known)));
	return entry ? `${entry.base}${encodeURIComponent(url.href)}` : null;
}
