// The osio-agent.v1 wire format (contract 3.2/3.3) and the Ed25519 helpers, in ONE module so the
// relay and the agent cannot disagree on a byte. Dependency-free (node:crypto only). Every WS
// message on the link is binary and carries exactly one frame: u8 type, u32 BE channel, payload.
//
// The decoder is strict on shape and silent on meaning: it checks sizes, channel placement and JSON
// key types, and leaves "is this kind allowed" to the caller. Anything it refuses is a FrameError
// whose `code` is the WS close code the caller should send (4002 protocol, 4013 overflow).

import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';

export const AGENT_SUBPROTOCOL = 'osio-agent.v1';
export const LIMITS = Object.freeze({
	maxMessage: 65536, maxJson: 4096, maxData: 32768, window: 262144, maxChannels: 6, heartbeatMs: 25000,
});
export const CLOSE_CODE = Object.freeze({
	GOING_AWAY: 1001, NO_AGENT: 4004, BAD_KIND: 4008, AUTH: 4001, PROTOCOL: 4002, DENIED: 4003,
	REPLACED: 4009, OVERFLOW: 4013, THROTTLED: 4029, LINK_LOST: 1012,
});
export const FRAME = Object.freeze({
	CHALLENGE: 0x01, AUTH: 0x02, READY: 0x03, PING: 0x04, PONG: 0x05, DISPOSE: 0x06, DISPOSED: 0x07,
	ROTATE: 0x08, ROTATED: 0x09, UNPAIR: 0x0a, OPEN: 0x10, OPENED: 0x11, DATA: 0x12, CREDIT: 0x13,
	RESIZE: 0x14, CLOSE: 0x15,
});

const HEADER_BYTES = 5;
const MAX_CLOSE_REASON_BYTES = 123;
const MAX_CHANNEL = 0xffffffff;

export class FrameError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'FrameError';
		this.code = code;
	}
}
const protocolError = (message) => new FrameError(CLOSE_CODE.PROTOCOL, message);

// Required JSON keys and their types. Unknown keys are ignored (contract 3.2).
const JSON_SHAPES = {
	CHALLENGE: { v: 'number', nonce: 'string', origin: 'string', ts: 'number', limits: 'object' },
	AUTH: { agent_id: 'string', sig: 'string', version: 'string', platform: 'string' },
	READY: { agent_id: 'string', account: 'object' },
	DISPOSE: { ws: 'string' },
	DISPOSED: { count: 'number' },
	ROTATE: { pubkey: 'string', sig_old: 'string', sig_new: 'string' },
	ROTATED: { fp: 'string' },
	OPEN: { kind: 'string', ws: 'string', term: 'string', safe: 'boolean', enc: 'string' },
	OPENED: { replay: 'number' },
};
const SHAPE_KIND = { PING: 'ping', PONG: 'ping', UNPAIR: 'empty', DATA: 'data', CREDIT: 'u32', RESIZE: 'resize', CLOSE: 'close' };
const CONTROL_NAMES = new Set(['CHALLENGE', 'AUTH', 'READY', 'PING', 'PONG', 'DISPOSE', 'DISPOSED', 'ROTATE', 'ROTATED', 'UNPAIR']);
const NAME_BY_TYPE = new Map(Object.entries(FRAME).map(([name, type]) => [type, name]));

const typeMatches = (value, type) => (type === 'object'
	? value !== null && typeof value === 'object' && !Array.isArray(value)
	: typeof value === type);

function parseJsonBody(name, payload) {
	if (payload.length > LIMITS.maxJson) throw protocolError(`${name} JSON over ${LIMITS.maxJson} bytes`);
	let body;
	try { body = JSON.parse(payload.toString('utf8')); } catch { throw protocolError(`${name} is not JSON`); }
	if (!typeMatches(body, 'object')) throw protocolError(`${name} must be a JSON object`);
	// Own keys only: a hostile `__proto__` member must not satisfy a required key.
	for (const [key, type] of Object.entries(JSON_SHAPES[name])) {
		if (!Object.hasOwn(body, key) || !typeMatches(body[key], type)) throw protocolError(`${name}.${key} missing or ill-typed`);
	}
	return body;
}

const BODY_PARSERS = {
	ping: (payload) => {
		if (payload.length !== 8) throw protocolError('PING/PONG carry exactly 8 bytes');
		return Buffer.from(payload);
	},
	empty: (payload) => {
		if (payload.length !== 0) throw protocolError('UNPAIR carries no payload');
		return null;
	},
	data: (payload) => {
		if (payload.length < 1 || payload.length > LIMITS.maxData) throw protocolError('DATA must be 1..32768 bytes');
		return Buffer.from(payload);
	},
	u32: (payload) => {
		if (payload.length !== 4) throw protocolError('CREDIT carries a u32');
		return payload.readUInt32BE(0);
	},
	resize: (payload) => {
		if (payload.length !== 4) throw protocolError('RESIZE carries two u16');
		return { cols: payload.readUInt16BE(0), rows: payload.readUInt16BE(2) };
	},
	close: (payload) => {
		if (payload.length < 2 || payload.length > 2 + MAX_CLOSE_REASON_BYTES) throw protocolError('CLOSE is a u16 code and a reason of at most 123 bytes');
		return { code: payload.readUInt16BE(0), reason: payload.subarray(2).toString('utf8') };
	},
};

/** Decode one complete WS message. Size is judged before anything is parsed, so an oversize
 *  message costs a length compare, not an allocation. */
export function decodeAgentFrame(message) {
	if (message.length > LIMITS.maxMessage) throw new FrameError(CLOSE_CODE.OVERFLOW, 'link message over 65536 bytes');
	if (message.length < HEADER_BYTES) throw protocolError('frame shorter than its header');
	const type = message[0];
	const channel = message.readUInt32BE(1);
	const name = NAME_BY_TYPE.get(type);
	if (!name) throw protocolError(`unknown frame type 0x${type.toString(16)}`);
	if (CONTROL_NAMES.has(name) !== (channel === 0)) throw protocolError(`${name} on channel ${channel}`);
	const payload = message.subarray(HEADER_BYTES);
	const kind = SHAPE_KIND[name];
	const body = kind ? BODY_PARSERS[kind](payload) : parseJsonBody(name, payload);
	return { type, name, channel, body };
}

/** Header plus payload, no validation. The decoder's tests and the stub agents use it to build
 *  frames the encoder would refuse. */
export function rawFrame(type, channel, payload = Buffer.alloc(0)) {
	const header = Buffer.alloc(HEADER_BYTES);
	header[0] = type;
	header.writeUInt32BE(channel, 1);
	return Buffer.concat([header, payload]);
}

const BODY_ENCODERS = {
	ping: (body) => {
		if (!Buffer.isBuffer(body) || body.length !== 8) throw new RangeError('PING/PONG carry exactly 8 bytes');
		return body;
	},
	empty: () => Buffer.alloc(0),
	data: (body) => body,
	u32: (body) => { const out = Buffer.alloc(4); out.writeUInt32BE(body, 0); return out; },
	resize: ({ cols, rows }) => { const out = Buffer.alloc(4); out.writeUInt16BE(cols, 0); out.writeUInt16BE(rows, 2); return out; },
	close: ({ code, reason = '' }) => {
		const text = Buffer.from(reason);
		if (text.length > MAX_CLOSE_REASON_BYTES) throw new RangeError('CLOSE reason over 123 bytes');
		return Buffer.concat([Buffer.from([code >> 8, code & 255]), text]);
	},
};

/** Encode by frame name. Throws RangeError on what the decoder would refuse, so a bug on our
 *  side fails at the sender instead of closing the peer's link. */
export function encodeAgentFrame(name, channel, body = null) {
	const type = FRAME[name];
	if (type === undefined) throw new RangeError(`unknown frame ${name}`);
	if (!Number.isInteger(channel) || channel < 0 || channel > MAX_CHANNEL) throw new RangeError('channel out of range');
	const kind = SHAPE_KIND[name];
	const payload = kind ? BODY_ENCODERS[kind](body) : Buffer.from(JSON.stringify(body));
	if (!kind && payload.length > LIMITS.maxJson) throw new RangeError(`${name} JSON over ${LIMITS.maxJson} bytes`);
	if (name === 'DATA' && (payload.length < 1 || payload.length > LIMITS.maxData)) throw new RangeError('DATA must be 1..32768 bytes');
	return rawFrame(type, channel, payload);
}

export const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
export const fromB64url = (text) => Buffer.from(String(text), 'base64url');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
	let bits = 0; let acc = 0; let out = '';
	for (const byte of bytes) {
		acc = (acc << 8) | byte; bits += 8;
		while (bits >= 5) { out += BASE32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
		acc &= (1 << bits) - 1;
	}
	return bits > 0 ? out + BASE32[(acc << (5 - bits)) & 31] : out;
}
const groupsOfFour = (text) => text.match(/.{4}/g).join('-');

/** 128 random bits, 26 base32 characters. */
export const newAgentId = () => base32(randomBytes(16));
/** First 10 bytes of SHA-256(raw public key): 80 bits as 4 groups of 4. */
export const fingerprint = (rawPublic) => groupsOfFour(base32(createHash('sha256').update(rawPublic).digest().subarray(0, 10)));
/** What the pairing UI, the agent prompt and the audit show instead of the raw sub: 64 bits of
 *  SHA-256(lower-case sub). Caveat: 64 bits identify a roster of five, not an adversarial set. */
export const subjectTag = (sub) => groupsOfFour(createHash('sha256').update(String(sub).toLowerCase()).digest('hex').slice(0, 16).toUpperCase());

// Ed25519 on node:crypto. Raw keys travel; KeyObjects are rebuilt through the fixed SPKI prefix.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function generateAgentKeyPair() {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519');
	return { privateKey, publicKeyRaw: rawPublicKey(publicKey) };
}
export const rawPublicKey = (keyObject) => (keyObject.type === 'public' ? keyObject : createPublicKey(keyObject)).export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length);
export const signMessage = (privateKey, message) => b64url(sign(null, message, privateKey));

/** True only for a valid signature; any malformed key or signature is false, never a throw. */
export function verifyMessage(rawPublic, message, signature) {
	try {
		if (!Buffer.isBuffer(rawPublic) || rawPublic.length !== 32 || typeof signature !== 'string') return false;
		const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, rawPublic]), format: 'der', type: 'spki' });
		return verify(null, message, key, fromB64url(signature));
	} catch {
		return false;
	}
}

// The signed strings are NUL-joined with a domain tag, and every one carries the relay origin so a
// signature is useless at another relay (contract 4, 5.1, 5.2).
const signed = (domain, ...parts) => Buffer.concat([Buffer.from(domain), ...parts.flatMap((part) => [Buffer.alloc(1), Buffer.from(part)])]);
export const authMessage = ({ origin, agentId, nonce, ts }) => signed('osio-agent-auth-v1', origin, agentId, nonce, String(ts));
export const pairMessage = ({ origin, pubkey, name, ts }) => signed('osio-agent-pair-v1', origin, pubkey, name, String(ts));
export const acceptMessage = ({ origin, pairId, subj }) => signed('osio-agent-accept-v1', origin, pairId, subj);
export const rotateMessage = ({ origin, agentId, newPubkey, nonce }) => signed('osio-agent-rotate-v1', origin, agentId, newPubkey, nonce);
