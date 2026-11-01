/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-wire.mjs                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the node's editor page may send on /api/fs (devil verdict 2026-11-01 editor on disk, F6, F7,
// F11; groot ADR 0044). The first message opens the socket: a bridge-signed machine token or the
// session secret this node gave that frame, and the app origin the frame pinned (roots are bound to
// it, F9). After it, one request per message, exact keys per op, every path `{root, rel}` and never
// absolute. Anything else is null and closes the socket.

export const FS_LIMITS = Object.freeze({
	maxPending: 4,
	maxSockets: 8,
	// Caveat: checked on the first message once it has arrived. ws's maxPayload is one per server,
	// so before that check an unauthenticated socket may make the node buffer one frame of up to
	// maxPayload (1 MiB, this server's own, not the pty's); 4 pending sockets is 4 MiB, then a 4401.
	maxAuthBytes: 4096,
	maxPayload: 1024 * 1024,
	// Raw bytes per read or write message: base64 makes 512 KiB 683 KiB, under maxPayload.
	maxChunk: 512 * 1024,
	maxFileBytes: 8 * 1024 * 1024,
	maxRel: 4096,
	maxSegment: 255,
	// Caveat: the frame opens as soon as the socket does, so 5 s only fails a frame starved that long.
	authWindowMs: 5000,
	maxListEntries: 5000,
	maxPickEntries: 2000,
	inFlightPerSocket: 8,
	// Caveat: a socket past this many queued requests is closed, so a frame that floods requests
	// faster than the disk answers loses its socket, never the node its memory (64 x 1 MiB at most).
	queuedPerSocket: 64,
});

export const FS_CLOSE = Object.freeze({ protocol: 4400, auth: 4401, full: 4429 });

// The wire's errors are FsErrorCode names (src/features/ide/vfs/errors.ts), plus `Conflict`: a save
// whose loaded hash no longer matches the disk (F13). It is not an FsError: the editor offers a choice.
export const FS_ERRORS = Object.freeze(['NotFound', 'PermissionDenied', 'NotADirectory', 'IsADirectory', 'NotEmpty', 'AlreadyExists', 'Loop', 'NoSpace', 'ReadOnly', 'TooLarge', 'Interrupted', 'Unsupported', 'Io', 'Conflict']);

const MACHINE_TOKEN = /^osionos_mc1\.[a-z2-7]{8}\.[A-Za-z0-9_-]{1,4000}\.[A-Za-z0-9_-]{1,200}$/;
const SESSION_SECRET = /^[A-Za-z0-9_-]{43}$/;
const APP_ORIGIN = /^(?:https?:\/\/[A-Za-z0-9.-]{1,253}(?::\d{1,5})?|app:\/\/[a-z0-9-]{1,63})$/;
const ROOT_ID = /^[a-f0-9]{16}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const NUL = /\u0000/;

function parseObject(text) {
	let value;
	try { value = JSON.parse(text); } catch { return null; }
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

const hasExactly = (value, keys) => {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

/** A path under a root: "" is the root itself; no empty, `.` or `..` segment, no NUL, bounded. */
export function isFsRel(rel) {
	if (typeof rel !== 'string' || NUL.test(rel) || Buffer.byteLength(rel) > FS_LIMITS.maxRel) return false;
	if (rel === '') return true;
	return rel.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && Buffer.byteLength(segment) <= FS_LIMITS.maxSegment);
}

const isCount = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const isId = (n) => Number.isSafeInteger(n) && n >= 1;
const isBool = (b) => typeof b === 'boolean';
const isData = (data) => typeof data === 'string' && data.length <= Math.ceil(FS_LIMITS.maxChunk / 3) * 4 && data.length % 4 === 0 && BASE64.test(data);

/** The opening message, or null. Over 4 KiB is refused before it is parsed. */
export function readFsAuth(text) {
	if (typeof text !== 'string' || Buffer.byteLength(text) > FS_LIMITS.maxAuthBytes) return null;
	const m = parseObject(text);
	if (!m || typeof m.appOrigin !== 'string' || !APP_ORIGIN.test(m.appOrigin)) return null;
	if (hasExactly(m, ['token', 'appOrigin']) && typeof m.token === 'string' && MACHINE_TOKEN.test(m.token)) return { kind: 'token', token: m.token, appOrigin: m.appOrigin };
	if (hasExactly(m, ['secret', 'appOrigin']) && typeof m.secret === 'string' && SESSION_SECRET.test(m.secret)) return { kind: 'secret', secret: m.secret, appOrigin: m.appOrigin };
	return null;
}

// Each op's keys besides `id` and `op`, and the check every value must pass.
const PATH = { root: (v) => typeof v === 'string' && ROOT_ID.test(v), rel: isFsRel };
const SHAPES = {
	list: PATH,
	stat: PATH,
	read: { ...PATH, offset: (n) => isCount(n, FS_LIMITS.maxFileBytes), length: (n) => isCount(n, FS_LIMITS.maxChunk) },
	// `expect`: the sha256 of the bytes the editor loaded, or null for "no such file yet" on a
	// create, or "any" when the caller takes the disk as it is (FsProvider's plain write).
	write: {
		...PATH, data: isData, offset: (n) => isCount(n, FS_LIMITS.maxFileBytes), total: (n) => isCount(n, FS_LIMITS.maxFileBytes),
		expect: (v) => v === null || v === 'any' || (typeof v === 'string' && SHA256.test(v)), create: isBool, overwrite: isBool,
	},
	mkdir: PATH,
	rename: { ...PATH, to: (v) => v !== '' && isFsRel(v), overwrite: isBool },
	delete: { ...PATH, recursive: isBool },
	watch: PATH,
	unwatch: { watch: isId },
	// The picker browses under $HOME only, by a path relative to it.
	pick: { rel: isFsRel, hidden: isBool },
	roots: {},
	addRoot: { rel: (v) => v !== '' && isFsRel(v) },
	removeRoot: { root: PATH.root },
};

/** One request, or null. */
export function readFsRequest(text) {
	if (typeof text !== 'string' || text.length > FS_LIMITS.maxPayload) return null;
	const m = parseObject(text);
	const shape = typeof m?.op === 'string' && Object.hasOwn(SHAPES, m.op) ? SHAPES[m.op] : null;
	if (!shape || !isId(m.id) || !hasExactly(m, ['id', 'op', ...Object.keys(shape)])) return null;
	for (const [key, valid] of Object.entries(shape)) if (!valid(m[key])) return null;
	return m;
}
