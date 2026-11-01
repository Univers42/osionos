/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pty-wire.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the web terminal frame may send on /api/pty (devil verdict 2026-11-01, W3 and W5; groot ADR
// 0041). The first message opens one shell: a bridge-signed machine token, or the session secret
// this node gave that frame, with the starting size. After it, only the desktop pty port's contract
// (ADR 0039, T2) passes: write, resize, ack. Exact keys, exact bounds; anything else is null.

export const PTY_LIMITS = Object.freeze({
	maxShells: 8,
	maxPending: 4,
	maxWrite: 65536,
	maxSize: 1000,
	// Caveat: checked on the first message once it has arrived. ws's maxPayload is one per server,
	// so before that check an unauthenticated socket may make the node buffer one frame of up to
	// maxPayload (~384 KiB); with at most 4 pending sockets that is ~1.5 MiB, then a 4401.
	maxAuthBytes: 4096,
	// Every character of the largest write JSON-escaped to six bytes (`\u0000`), plus the envelope.
	maxPayload: 65536 * 6 + 64,
	// Caveat: the frame sends its opening as soon as the socket opens, so 5 s only fails a frame
	// starved for that long (a frozen tab); it then gets 4401 and asks for a new token.
	authWindowMs: 5000,
	// The desktop's watermarks (groot desktop-pty.js PTY_LIMITS), so both terminals pause alike.
	// Caveat: they count UTF-16 chars, not bytes or render time — a burst of wide characters
	// renders slower than its count suggests.
	highWatermark: 100000,
	lowWatermark: 5000,
});

export const PTY_CLOSE = Object.freeze({ protocol: 4400, auth: 4401, full: 4429, unavailable: 4503 });

// The bridge-signed machine token only (scripts/ide-machine-protocol.mjs): the shared-secret
// osionos_ide1 token opens no shell (W3).
const MACHINE_TOKEN = /^osionos_mc1\.[a-z2-7]{8}\.[A-Za-z0-9_-]{1,4000}\.[A-Za-z0-9_-]{1,200}$/;
// 32 random bytes, base64url without padding.
const SESSION_SECRET = /^[A-Za-z0-9_-]{43}$/;

const isSize = (n) => Number.isInteger(n) && n >= 1 && n <= PTY_LIMITS.maxSize;

function parseObject(text) {
	let value;
	try { value = JSON.parse(text); } catch { return null; }
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

const hasExactly = (value, keys) => {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

/** The opening message, or null. Over 4 KiB is refused before it is parsed. */
export function readPtyAuth(text) {
	if (typeof text !== 'string' || Buffer.byteLength(text) > PTY_LIMITS.maxAuthBytes) return null;
	const m = parseObject(text);
	if (!m || !isSize(m.cols) || !isSize(m.rows)) return null;
	if (hasExactly(m, ['token', 'cols', 'rows']) && typeof m.token === 'string' && MACHINE_TOKEN.test(m.token)) {
		return { kind: 'token', token: m.token, cols: m.cols, rows: m.rows };
	}
	if (hasExactly(m, ['secret', 'cols', 'rows']) && typeof m.secret === 'string' && SESSION_SECRET.test(m.secret)) {
		return { kind: 'secret', secret: m.secret, cols: m.cols, rows: m.rows };
	}
	return null;
}

/** A command for the open shell, or null. One parse per message: this runs on every keystroke. */
export function readPtyCommand(text) {
	if (typeof text !== 'string' || text.length > PTY_LIMITS.maxPayload) return null;
	const m = parseObject(text);
	if (m?.op === 'write') {
		return hasExactly(m, ['op', 'data']) && typeof m.data === 'string' && m.data.length <= PTY_LIMITS.maxWrite ? { op: m.op, data: m.data } : null;
	}
	if (m?.op === 'resize') return hasExactly(m, ['op', 'cols', 'rows']) && isSize(m.cols) && isSize(m.rows) ? { op: m.op, cols: m.cols, rows: m.rows } : null;
	if (m?.op === 'ack') return hasExactly(m, ['op', 'chars']) && Number.isSafeInteger(m.chars) && m.chars >= 0 ? { op: m.op, chars: m.chars } : null;
	return null;
}
