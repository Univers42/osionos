// The osio-agent.v1 codec (contract 3.2/3.3) and the signature helpers both ends share.
// T-N3 size errors, T-N14 unknown type, T-N18 seeded decoder fuzz, T-P5 Ed25519 vectors.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey } from 'node:crypto';
import { createFrameDecoder } from '../../scripts/ide-ws.mjs';
import {
	FRAME, LIMITS, CLOSE_CODE, FrameError, encodeAgentFrame, decodeAgentFrame, rawFrame,
	generateAgentKeyPair, rawPublicKey, signMessage, verifyMessage, authMessage, fingerprint, subjectTag,
	newAgentId, b64url, fromB64url,
} from '../../scripts/ide-agent-frames.mjs';

const NONCE = Buffer.alloc(32, 7);
const VALID = {
	CHALLENGE: [0, { v: 1, nonce: b64url(NONCE), origin: 'https://r.example', ts: 1, limits: { max_message: 65536 } }],
	AUTH: [0, { agent_id: 'A'.repeat(26), sig: 'x', version: '1.0.0', platform: 'linux-x64' }],
	READY: [0, { agent_id: 'A'.repeat(26), account: { un: null, subj: 'AAAA-BBBB-CCCC-DDDD' }, latest_version: null }],
	PING: [0, Buffer.alloc(8, 1)],
	PONG: [0, Buffer.alloc(8, 1)],
	DISPOSE: [0, { ws: '22222222-2222-4222-8222-222222222222' }],
	DISPOSED: [0, { count: 2 }],
	ROTATE: [0, { pubkey: 'k', sig_old: 'a', sig_new: 'b' }],
	ROTATED: [0, { fp: 'ABCD-EFGH-IJKL-MNOP' }],
	UNPAIR: [0, null],
	OPEN: [3, { kind: 'pty', ws: '22222222-2222-4222-8222-222222222222', term: '0', safe: false, enc: 'none' }],
	OPENED: [3, { replay: 12 }],
	DATA: [3, Buffer.from('ls\r')],
	CREDIT: [3, 65536],
	RESIZE: [3, { cols: 120, rows: 40 }],
	CLOSE: [3, { code: 1000, reason: 'process ended' }],
};

const codeOf = (fn) => { try { fn(); } catch (error) { assert.ok(error instanceof FrameError, String(error)); return error.code; } return null; };

describe('codec round trip', () => {
	for (const [name, [channel, body]] of Object.entries(VALID)) {
		it(`${name} survives encode then decode`, () => {
			const frame = decodeAgentFrame(encodeAgentFrame(name, channel, body));
			assert.equal(frame.name, name);
			assert.equal(frame.type, FRAME[name]);
			assert.equal(frame.channel, channel);
			assert.deepEqual(frame.body, body);
		});
	}
	it('uses the 5-byte header: type, then channel as u32 big-endian', () => {
		const wire = encodeAgentFrame('DATA', 0x01020304, Buffer.from('x'));
		assert.deepEqual([...wire.subarray(0, 6)], [0x12, 1, 2, 3, 4, 0x78]);
	});
});

describe('T-N3 size errors', () => {
	it('a link message of 65 537 bytes is 4013, 65 536 is not', () => {
		assert.equal(codeOf(() => decodeAgentFrame(Buffer.alloc(LIMITS.maxMessage + 1, 0x12))), CLOSE_CODE.OVERFLOW);
		assert.equal(CLOSE_CODE.OVERFLOW, 4013);
		const atCap = rawFrame(FRAME.DATA, 1, Buffer.alloc(LIMITS.maxData));
		assert.equal(decodeAgentFrame(atCap).body.length, LIMITS.maxData);
	});
	it('a DATA payload of 32 769 bytes inside a valid message is 4002', () => {
		assert.equal(codeOf(() => decodeAgentFrame(rawFrame(FRAME.DATA, 1, Buffer.alloc(LIMITS.maxData + 1)))), 4002);
	});
	it('control JSON over 4096 bytes is 4002', () => {
		const big = Buffer.from(JSON.stringify({ ws: 'x'.repeat(LIMITS.maxJson) }));
		assert.equal(codeOf(() => decodeAgentFrame(rawFrame(FRAME.DISPOSE, 0, big))), 4002);
	});
	it('the encoder refuses what the decoder would refuse', () => {
		assert.throws(() => encodeAgentFrame('DATA', 1, Buffer.alloc(LIMITS.maxData + 1)), RangeError);
		assert.throws(() => encodeAgentFrame('DISPOSE', 0, { ws: 'x'.repeat(LIMITS.maxJson) }), RangeError);
	});
});

describe('T-N14 malformed frames are 4002', () => {
	const cases = {
		'unknown type': rawFrame(0x7f, 0, Buffer.alloc(0)),
		'type 0': rawFrame(0x00, 0, Buffer.alloc(0)),
		'shorter than the header': Buffer.from([0x04, 0, 0]),
		'empty message': Buffer.alloc(0),
		'control type on a channel': rawFrame(FRAME.PING, 5, Buffer.alloc(8)),
		'channel type on channel 0': rawFrame(FRAME.DATA, 0, Buffer.from('x')),
		'PING not 8 bytes': rawFrame(FRAME.PING, 0, Buffer.alloc(7)),
		'empty DATA': rawFrame(FRAME.DATA, 1, Buffer.alloc(0)),
		'CREDIT not 4 bytes': rawFrame(FRAME.CREDIT, 1, Buffer.alloc(3)),
		'RESIZE not 4 bytes': rawFrame(FRAME.RESIZE, 1, Buffer.alloc(5)),
		'UNPAIR with a payload': rawFrame(FRAME.UNPAIR, 0, Buffer.from('x')),
		'JSON that is not JSON': rawFrame(FRAME.DISPOSE, 0, Buffer.from('{nope')),
		'JSON array': rawFrame(FRAME.DISPOSE, 0, Buffer.from('[]')),
		'JSON missing a required key': rawFrame(FRAME.DISPOSE, 0, Buffer.from('{}')),
		'JSON key of the wrong type': rawFrame(FRAME.DISPOSED, 0, Buffer.from('{"count":"2"}')),
		'inherited key does not count': rawFrame(FRAME.DISPOSE, 0, Buffer.from('{"__proto__":{"ws":"x"}}')),
		'CLOSE without a code': rawFrame(FRAME.CLOSE, 1, Buffer.from([1])),
		'CLOSE reason over 123 bytes': rawFrame(FRAME.CLOSE, 1, Buffer.concat([Buffer.from([3, 232]), Buffer.alloc(124, 0x61)])),
	};
	for (const [label, wire] of Object.entries(cases)) {
		it(label, () => assert.equal(codeOf(() => decodeAgentFrame(wire)), 4002));
	}
	it('unknown JSON keys are ignored', () => {
		const frame = decodeAgentFrame(rawFrame(FRAME.DISPOSE, 0, Buffer.from('{"ws":"w","extra":1}')));
		assert.equal(frame.body.ws, 'w');
	});
});

describe('T-N18 decoder fuzz', () => {
	const seed = Number(process.env.OSIO_FUZZ_SEED ?? Date.now() % 2 ** 32) >>> 0;
	// mulberry32: a 32-bit PRNG small enough to inline, so a failing seed replays exactly.
	const prng = (state) => () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const randomBytes = (rand, length) => Buffer.from(Array.from({ length }, () => Math.floor(rand() * 256)));

	function mutate(rand, wire) {
		const copy = Buffer.from(wire);
		const kind = Math.floor(rand() * 4);
		if (kind === 0 && copy.length) copy[Math.floor(rand() * copy.length)] ^= 1 << Math.floor(rand() * 8);
		if (kind === 1) return copy.subarray(0, Math.floor(rand() * copy.length));
		if (kind === 2) return Buffer.concat([copy, randomBytes(rand, Math.floor(rand() * 40))]);
		if (kind === 3 && copy.length) copy[0] = Math.floor(rand() * 256);
		return copy;
	}

	it('10 000 random and mutated messages give only a frame or a FrameError (4002/4013)', () => {
		console.log(`# T-N18 fuzz seed=${seed} (replay with OSIO_FUZZ_SEED=${seed})`);
		const rand = prng(seed);
		const seeds = Object.entries(VALID).map(([name, [channel, body]]) => encodeAgentFrame(name, channel, body));
		let decoded = 0; let refused = 0;
		for (let i = 0; i < 10_000; i++) {
			const wire = i % 3 === 0
				? randomBytes(rand, Math.floor(rand() * 80))
				: mutate(rand, seeds[Math.floor(rand() * seeds.length)]);
			try {
				const frame = decodeAgentFrame(wire);
				assert.ok(Number.isInteger(frame.type) && frame.channel >= 0 && frame.channel <= 0xffffffff);
				assert.ok(!Buffer.isBuffer(frame.body) || frame.body.length <= LIMITS.maxData);
				decoded += 1;
			} catch (error) {
				assert.ok(error instanceof FrameError, `seed ${seed} case ${i}: ${error?.stack}`);
				assert.ok([4002, 4013].includes(error.code), `seed ${seed} case ${i}: code ${error.code}`);
				refused += 1;
			}
		}
		assert.equal(decoded + refused, 10_000);
		assert.ok(decoded > 0 && refused > 0, 'the generator must hit both outcomes');
	});

	it('an oversize message is refused by its length alone, never parsed', () => {
		const huge = Buffer.alloc(LIMITS.maxMessage + 1, 0x7b);
		assert.equal(codeOf(() => decodeAgentFrame(huge)), 4013);
	});

	it('the WebSocket layer under the 64 KiB cap only returns messages or its size error', () => {
		const rand = prng(seed ^ 0x5bd1e995);
		for (let i = 0; i < 2_000; i++) {
			const feed = createFrameDecoder({ maxMessage: LIMITS.maxMessage });
			try {
				for (const message of feed(randomBytes(rand, Math.floor(rand() * 200)))) assert.ok(message.data.length <= LIMITS.maxMessage);
			} catch (error) {
				assert.match(error.message, /too large/, `seed ${seed} case ${i}`);
			}
		}
	});
});

describe('T-P5 Ed25519 with node:crypto', () => {
	// RFC 8032 section 7.1, TEST 1: empty message.
	const SEED = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex');
	const PUBLIC = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
	const SIGNATURE = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
	const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]);

	it('signs the RFC 8032 vector byte for byte and the raw public key matches', () => {
		const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
		assert.equal(Buffer.from(fromB64url(signMessage(privateKey, Buffer.alloc(0)))).toString('hex'), SIGNATURE);
		assert.deepEqual(rawPublicKey(privateKey), PUBLIC);
	});
	it('verifies that signature from the raw public key, and nothing else', () => {
		const sig = b64url(Buffer.from(SIGNATURE, 'hex'));
		assert.equal(verifyMessage(PUBLIC, Buffer.alloc(0), sig), true);
		assert.equal(verifyMessage(PUBLIC, Buffer.from('x'), sig), false);
		assert.equal(verifyMessage(Buffer.alloc(32, 1), Buffer.alloc(0), sig), false);
	});
	it('verifyMessage never throws on garbage', () => {
		for (const sig of ['', '!!!', 'AAAA', b64url(Buffer.alloc(63)), b64url(Buffer.alloc(65)), undefined, 5]) {
			assert.equal(verifyMessage(PUBLIC, Buffer.alloc(1), sig), false);
		}
		assert.equal(verifyMessage(Buffer.alloc(5), Buffer.alloc(1), b64url(Buffer.alloc(64))), false);
		assert.equal(verifyMessage('not a buffer', Buffer.alloc(1), b64url(Buffer.alloc(64))), false);
	});
	it('a generated key signs the auth message and the origin is inside the signature', () => {
		const { privateKey, publicKeyRaw } = generateAgentKeyPair();
		const fields = { origin: 'https://r.example', agentId: newAgentId(), nonce: NONCE, ts: 1760000000000 };
		const sig = signMessage(privateKey, authMessage(fields));
		assert.equal(verifyMessage(publicKeyRaw, authMessage(fields), sig), true);
		assert.equal(verifyMessage(publicKeyRaw, authMessage({ ...fields, origin: 'https://other.example' }), sig), false);
		assert.equal(verifyMessage(publicKeyRaw, authMessage({ ...fields, nonce: Buffer.alloc(32, 8) }), sig), false);
	});
});

describe('identifiers', () => {
	it('fingerprint is 4 groups of 4 base32 characters from the first 10 bytes of SHA-256', () => {
		assert.match(fingerprint(PUBLIC_KEY()), /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
	});
	it('agent ids are 26 base32 characters and differ', () => {
		const a = newAgentId(); const b = newAgentId();
		assert.match(a, /^[A-Z2-7]{26}$/);
		assert.notEqual(a, b);
	});
	it('subjectTag is a stable 16-hex digest in 4 groups, never the sub', () => {
		const sub = '11111111-1111-4111-8111-111111111111';
		assert.match(subjectTag(sub), /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
		assert.equal(subjectTag(sub), subjectTag(sub.toUpperCase()));
		assert.ok(!subjectTag(sub).includes('1111-1111-4111'));
	});
});

function PUBLIC_KEY() { return Buffer.alloc(32, 3); }
