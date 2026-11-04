// The pty socket's wire (devil verdict 2026-11-01, W3 and W5): the first message opens a shell with
// a token or the frame's session secret (or a remembered computer's two factors, Amendment 1), then only the desktop's write, resize and ack pass, each
// within its bounds. Everything else is null, and nothing here throws.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PTY_LIMITS, readPtyAuth, readPtyCommand } from '../../packages/osionos-node/pty-wire.mjs';
import { anyWireText, seededRandom } from './support/seeded-values.mjs';

const TOKEN = `osionos_mc1.abcdefgh.${'p'.repeat(200)}.${'s'.repeat(86)}`;
const SECRET = 'A'.repeat(43);
const RESUME = `osionos_mr1.abcdefgh.${'p'.repeat(200)}.${'s'.repeat(86)}`;
const PROD = 'https://baas.tail10f2ea.ts.net:8443';
const text = (value) => JSON.stringify(value);

test('the first message is a token or a session secret, with the starting size, and nothing else', () => {
	assert.deepEqual(readPtyAuth(text({ token: TOKEN, cols: 80, rows: 24 })), { kind: 'token', token: TOKEN, appOrigin: null, cols: 80, rows: 24 });
	assert.deepEqual(readPtyAuth(text({ secret: SECRET, cols: 1, rows: 1000 })), { kind: 'secret', secret: SECRET, cols: 1, rows: 1000 });
	const refused = [
		'', 'null', '[]', '"x"', '{', text({ token: TOKEN }), text({ token: TOKEN, cols: 80, rows: 24, extra: 1 }),
		text({ token: TOKEN, secret: SECRET, cols: 80, rows: 24 }), text({ token: 'osionos_ide1.a.b', cols: 80, rows: 24 }),
		text({ token: TOKEN, cols: 0, rows: 24 }), text({ token: TOKEN, cols: 80, rows: 1001 }), text({ token: TOKEN, cols: '80', rows: 24 }),
		text({ secret: 'short', cols: 80, rows: 24 }), text({ secret: `${SECRET}A`, cols: 80, rows: 24 }), text({ op: 'write', data: 'x' }),
	];
	for (const message of refused) assert.equal(readPtyAuth(message), null, message.slice(0, 80));
});

test('R1, R4: a token may name the pinned app origin; a remembered opening needs the device secret, the resume assertion and the origin', () => {
	const size = { cols: 80, rows: 24 };
	assert.deepEqual(readPtyAuth(text({ token: TOKEN, appOrigin: PROD, ...size })), { kind: 'token', token: TOKEN, appOrigin: PROD, ...size });
	assert.deepEqual(readPtyAuth(text({ device: SECRET, assertion: RESUME, appOrigin: PROD, ...size })), { kind: 'remembered', device: SECRET, assertion: RESUME, appOrigin: PROD, ...size });
	for (const dev of ['http://localhost:3001', 'app://osionos']) {
		assert.equal(readPtyAuth(text({ token: TOKEN, appOrigin: dev, ...size }))?.appOrigin, dev, 'a dev or desktop origin is read, and remembered by nothing');
	}
	const refused = [
		{ device: SECRET, ...size }, { assertion: RESUME, ...size }, { device: SECRET, assertion: RESUME, ...size }, { assertion: RESUME, appOrigin: PROD, ...size },
		{ device: SECRET, appOrigin: PROD, ...size }, { device: SECRET, assertion: TOKEN, appOrigin: PROD, ...size }, { token: RESUME, ...size },
		{ device: SECRET, assertion: RESUME, appOrigin: `${PROD}/`, ...size }, { token: TOKEN, appOrigin: 'https://a b', ...size }, { token: TOKEN, appOrigin: 'null', ...size },
		{ token: TOKEN, appOrigin: 42, ...size }, { secret: SECRET, appOrigin: PROD, ...size }, { device: 'short', assertion: RESUME, appOrigin: PROD, ...size },
	];
	for (const message of refused) assert.equal(readPtyAuth(text(message)), null, JSON.stringify(message).slice(0, 120));
});

test('a first message over 4 KiB is refused before it is parsed', () => {
	const padded = text({ token: TOKEN, cols: 80, rows: 24 }).replace('{', `{${' '.repeat(PTY_LIMITS.maxAuthBytes)}`);
	assert.equal(readPtyAuth(padded), null);
	assert.equal(PTY_LIMITS.maxAuthBytes, 4096);
});

test('write, resize and ack pass at their exact bounds; one past each is refused', () => {
	assert.deepEqual(readPtyCommand(text({ op: 'write', data: 'x'.repeat(65536) })), { op: 'write', data: 'x'.repeat(65536) });
	assert.equal(readPtyCommand(text({ op: 'write', data: 'x'.repeat(65537) })), null);
	assert.deepEqual(readPtyCommand(text({ op: 'resize', cols: 1, rows: 1000 })), { op: 'resize', cols: 1, rows: 1000 });
	for (const [cols, rows] of [[0, 24], [80, 1001], [1.5, 24], [80, '24'], [null, 24]]) {
		assert.equal(readPtyCommand(text({ op: 'resize', cols, rows })), null, `${cols}x${rows}`);
	}
	assert.deepEqual(readPtyCommand(text({ op: 'ack', chars: 0 })), { op: 'ack', chars: 0 });
	assert.deepEqual(readPtyCommand(text({ op: 'ack', chars: 2 ** 53 - 1 })), { op: 'ack', chars: 2 ** 53 - 1 });
	for (const chars of [-1, 1.5, 2 ** 53, '5']) assert.equal(readPtyCommand(text({ op: 'ack', chars })), null, String(chars));
});

test('an id, another op, an extra key, an array or broken JSON is refused', () => {
	const refused = [
		text({ op: 'write', data: 'x', id: 'other' }), text({ op: 'create', cols: 80, rows: 24 }), text({ op: 'kill' }),
		text({ op: 'resize', cols: 80, rows: 24, data: 'x' }), text([{ op: 'write', data: 'x' }]), text({ op: 'write' }),
		'{"op":"write","data":"x"', 'write', '', '{"op":"write","data":"x","__proto__":{"a":1}}',
	];
	for (const message of refused) assert.equal(readPtyCommand(message), null, message);
});

// The largest valid write, every character JSON-escaped to six bytes, still fits one frame.
test('maxPayload fits the largest valid write with every character escaped, and no more', () => {
	const worst = text({ op: 'write', data: '\u0000'.repeat(PTY_LIMITS.maxWrite) });
	assert.ok(Buffer.byteLength(worst) <= PTY_LIMITS.maxPayload, `${Buffer.byteLength(worst)} > ${PTY_LIMITS.maxPayload}`);
	assert.ok(PTY_LIMITS.maxPayload - Buffer.byteLength(worst) < 64);
});

test('property: generated messages never throw, and whatever passes is inside the bounds (W5)', () => {
	const seed = Number(process.env.PTY_WIRE_SEED ?? 20261101);
	const rand = seededRandom(seed);
	let passed = 0;
	for (let run = 0; run < 20000; run += 1) {
		const message = anyWireText(rand);
		let command;
		assert.doesNotThrow(() => { command = readPtyCommand(message); }, `seed ${seed} run ${run}`);
		if (command === null) continue;
		passed += 1;
		if (command.op === 'write') {
			assert.deepEqual(Object.keys(command), ['op', 'data']);
			assert.ok(typeof command.data === 'string' && command.data.length <= PTY_LIMITS.maxWrite);
		} else if (command.op === 'resize') {
			assert.deepEqual(Object.keys(command), ['op', 'cols', 'rows']);
			for (const n of [command.cols, command.rows]) assert.ok(Number.isInteger(n) && n >= 1 && n <= 1000, `seed ${seed} run ${run}`);
		} else {
			assert.equal(command.op, 'ack');
			assert.deepEqual(Object.keys(command), ['op', 'chars']);
			assert.ok(Number.isSafeInteger(command.chars) && command.chars >= 0);
		}
		assert.equal(readPtyAuth(message), null, 'a command is never also an opening');
	}
	assert.ok(passed > 200, `the generator reached only ${passed} valid commands; the property would pass vacuously`);
});
