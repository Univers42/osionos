/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-json-response.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Writes a JSON answer, gzipped when it is large and the client accepts gzip.
 * The largest live account's GET /api/object-databases is 2759 KiB of JSON; gzip
 * level 4 makes it 335 KiB in 10 ms, level 6 saves 10% more for twice the CPU
 * (measured 2026-10-26 on the live bridge). The headers are written before this
 * returns, as the plain writer always did, so a caller that answers twice still
 * throws ERR_HTTP_HEADERS_SENT at the second answer instead of racing the stream.
 * Caveat: BREACH. A compressed answer that holds a secret next to text an attacker
 * chose leaks the secret through its length. Nothing under GZIP_MIN_CHARS is
 * compressed, which keeps every token and session answer plain; the bridge's
 * credential is a bearer header a cross-site page cannot attach, so it cannot
 * replay the large reads either.
 */

import { pipeline } from 'node:stream';
import { createGzip } from 'node:zlib';

export const GZIP_MIN_CHARS = 16 * 1024;
const GZIP_LEVEL = 4;

/** True when the Accept-Encoding header weighs gzip above zero; an explicit gzip entry beats `*`. */
export function acceptsGzip(header) {
	const weights = new Map();
	for (const entry of String(header ?? '').toLowerCase().split(',')) {
		const [coding, ...params] = entry.split(';').map((part) => part.trim());
		if (!coding) continue;
		const quality = params.find((param) => param.startsWith('q='));
		weights.set(coding, quality === undefined ? 1 : Number(quality.slice(2)));
	}
	return (weights.get('gzip') ?? weights.get('*') ?? 0) > 0;
}

function logStreamError(error) {
	// A client that leaves mid-answer closes the stream early; that is not a fault here.
	if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(`bridge: gzip answer failed: ${error.message}`);
}

export function writeJsonResponse(response, status, headers, body) {
	const payload = JSON.stringify(body);
	if (typeof payload !== 'string' || payload.length < GZIP_MIN_CHARS) {
		response.writeHead(status, headers);
		response.end(payload);
		return;
	}
	const vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding';
	if (!acceptsGzip(response.req?.headers['accept-encoding'])) {
		response.writeHead(status, { ...headers, vary });
		response.end(payload);
		return;
	}
	response.writeHead(status, { ...headers, vary, 'content-encoding': 'gzip' });
	const gzip = createGzip({ level: GZIP_LEVEL });
	pipeline(gzip, response, logStreamError);
	gzip.end(payload);
}
