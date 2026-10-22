/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mime.mjs                                    :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The content check of the upload plane: what the bytes ARE, not what the
 * request says they are.
 *
 * The declared `Content-Type` reaches the browser as the type a stored object
 * is served with, so a `text/html` body declared `image/png` would be opened
 * as a page on the app's own origin. Every type that is served INLINE must
 * therefore sniff to exactly that type; the types that are served as an
 * attachment are never rendered, so they are stored as they come.
 *
 * The inline set and the page set live here, not in the storage client: this
 * module is what decides whether a byte sequence may be served under a type.
 *
 * Caveat: the check does not strip or truncate what an upload carries. A phone
 * appends data after the JPEG EOI (a motion photo), and refusing the tail
 * would break real uploads. The tail is contained by the serve headers
 * (nosniff and a CSP sandbox); the avatar paths strip the bytes they store.
 */

import { gifCommentText, imageFormat, imageInfo } from './bridge-image-meta.mjs';

/**
 * Types a browser opens as a page that can run script. The app rewrites /api/* to
 * the bridge, so a stored object is served on the app's own origin, behind a
 * capability URL that needs no session: one such upload and one click ran script
 * as the victim (devil C76). A refused image upload falls back to a data: URL in
 * the editor, and <img> never runs an SVG's script.
 */
export const PAGE_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml']);

/**
 * Types served inline: an <img>, <video> or <audio> source, or plain text. Anything
 * else downloads as opaque bytes. SVG stays inline for the objects stored before
 * PAGE_TYPES existed; the sandbox below keeps its script from running.
 */
export const INLINE_TYPES = new Set([
	'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
	'video/mp4', 'video/webm', 'video/quicktime',
	'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
	'text/plain',
]);

/**
 * A sniffed type that may still answer for a declared one. `audio/webm` and
 * `video/webm` are the same container (EBML): the bytes do not say which codec
 * they carry, so the declared type decides and the container only has to match.
 */
const ACCEPTED_SNIFF = {
	'audio/webm': ['audio/webm', 'video/webm'],
};

/** A GIF comment that carries markup is a polyglot: some renderers treat it as HTML. */
const GIF_MARKUP = /<[a-zA-Z!/?]/;

/** The type without its parameters, lowercased: `Text/HTML; charset=x` → `text/html`. */
export function baseMime(contentType) {
	return String(contentType ?? '').split(';')[0].trim().toLowerCase();
}

function unsupported(message) {
	return Object.assign(new Error(message), { status: 415, code: 'unsupported_media_type' });
}

function startsWith(buffer, text) {
	return buffer.length >= text.length && buffer.toString('latin1', 0, text.length) === text;
}

/** The ISO base media file type brand, which decides what an MP4 container holds. */
function mp4Brand(buffer) {
	return buffer.toString('latin1', 8, 12);
}

/** Text is the last resort: valid UTF-8 without control characters. */
function isPlainText(buffer) {
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
	} catch {
		return false;
	}
	// Caveat: a control character check is not a language check — a binary blob that
	// happens to be valid UTF-8 is read as text, and a text file in UTF-16 is not.
	return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
}

/** The image families: the magic picks the parser, the parser proves the bytes. */
function sniffImage(buffer) {
	try {
		const info = imageInfo(buffer);
		if (info.type === 'image/gif' && GIF_MARKUP.test(gifCommentText(buffer))) return null;
		return info.type;
	} catch {
		// The magic says "image", the parser says "broken": it is not text either.
		return null;
	}
}

/** The non-image families, by their magic bytes. */
function sniffContainer(buffer) {
	if (startsWith(buffer, '%PDF-')) return 'application/pdf';
	if (startsWith(buffer, 'PK\u0003\u0004')) return 'application/zip';
	if (startsWith(buffer, 'OggS')) return 'audio/ogg';
	if (startsWith(buffer, 'ID3')) return 'audio/mpeg';
	if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
	if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'video/webm';
	if (startsWith(buffer, 'RIFF') && buffer.length >= 12 && buffer.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
	if (buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp') {
		const brand = mp4Brand(buffer);
		if (brand === 'avif' || brand === 'avis') return 'image/avif';
		if (brand === 'qt  ') return 'video/quicktime';
		if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
		return 'video/mp4';
	}
	const head = buffer.subarray(0, 1024).toString('latin1').toLowerCase().trimStart();
	if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'text/html';
	if (head.includes('<svg')) return 'image/svg+xml';
	if (isPlainText(buffer)) return 'text/plain';
	return null;
}

/**
 * What the bytes are: `'image/png'`, `'application/pdf'`, … or null when they are
 * nothing this bridge serves. An image is parsed, not guessed: a PNG signature
 * without a valid IHDR is not a PNG.
 */
export function sniffMime(buffer) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
	// A file that claims to be an image is judged as one: the magic picks the parser
	// and the parser has the last word, so a broken image never falls back to text.
	if (imageFormat(buffer)) return sniffImage(buffer);
	return sniffContainer(buffer);
}

/**
 * The gate of the shared writer: an inline type must match the bytes, a type
 * that is served as an attachment may be anything. Throws a 415
 * `unsupported_media_type` — the caller writes nothing.
 */
export function assertBytesMatch(declared, buffer) {
	const mime = baseMime(declared);
	if (PAGE_TYPES.has(mime)) throw unsupported(`A ${mime} upload is refused.`);
	if (!INLINE_TYPES.has(mime)) return true;
	const sniffed = sniffMime(buffer);
	const accepted = ACCEPTED_SNIFF[mime] ?? [mime];
	if (!accepted.includes(sniffed)) throw unsupported(`The uploaded bytes are not ${mime}.`);
	return true;
}
