// Generated inputs for the property tests of the pty wire (devil verdict 2026-11-01, W5). fast-check
// is not in this repo's manifest, so this is a seeded generator: a failing seed is printed and
// replays the same run.
// Caveat: the shapes are biased toward the wire's own keys and edges (65536 chars, 1..1000, 2^53);
// a malformed input far from those shapes is reached only through the random-text branch.

/** mulberry32: a small deterministic PRNG, so a run is a function of its seed. */
export function seededRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = (rand, items) => items[Math.floor(rand() * items.length)];

const EDGE_NUMBERS = [0, 1, -1, 2, 80, 999, 1000, 1001, 1.5, -0.5, 2 ** 31, 2 ** 53, 2 ** 53 - 1, -(2 ** 53), 1e308, -1e308];
const EDGE_LENGTHS = [0, 1, 7, 65535, 65536, 65537, 70000];
const OPS = ['write', 'resize', 'ack', 'create', 'kill', 'exit', 'data', '', 'WRITE', null, 7];
const KEYS = ['op', 'data', 'cols', 'rows', 'chars', 'id', 'token', 'secret', '__proto__', 'constructor'];

function anyString(rand) {
	const length = rand() < 0.3 ? pick(rand, EDGE_LENGTHS) : Math.floor(rand() * 40);
	const alphabet = ['a', 'y', '\n', '\u001b', '"', '\\', '\u0000', '\ud83d', '\ude00', 'é', '中'];
	if (length > 100) return pick(rand, alphabet).repeat(length);
	let text = '';
	for (let i = 0; i < length; i += 1) text += pick(rand, alphabet);
	return text;
}

function anyNumber(rand) {
	return rand() < 0.6 ? pick(rand, EDGE_NUMBERS) : Math.floor(rand() * 2000) - 500 + (rand() < 0.2 ? 0.25 : 0);
}

/** A JSON value shaped like a pty command: right keys, wrong types, extra keys, edge sizes. */
export function anyCommandValue(rand, depth = 0) {
	const roll = rand();
	if (roll < 0.08) return anyString(rand);
	if (roll < 0.14) return anyNumber(rand);
	if (roll < 0.18) return null;
	if (roll < 0.22 && depth < 2) return [anyCommandValue(rand, depth + 1)];
	const value = { op: pick(rand, OPS) };
	if (rand() < 0.7) value.data = rand() < 0.8 ? anyString(rand) : anyNumber(rand);
	if (rand() < 0.6) value.cols = rand() < 0.85 ? anyNumber(rand) : String(anyNumber(rand));
	if (rand() < 0.6) value.rows = rand() < 0.85 ? anyNumber(rand) : String(anyNumber(rand));
	if (rand() < 0.6) value.chars = anyNumber(rand);
	if (rand() < 0.15) value[pick(rand, KEYS)] = depth < 2 ? anyCommandValue(rand, depth + 1) : 'x';
	// Drop keys at random so the exact-key shapes are hit as well as the noisy ones.
	for (const key of Object.keys(value)) if (key !== 'op' && rand() < 0.35) delete value[key];
	return value;
}

// The three real shapes, with edge values in every field: most pass, the edges must not.
function nearCommand(rand) {
	const op = pick(rand, ['write', 'resize', 'ack']);
	if (op === 'write') return { op, data: anyString(rand) };
	if (op === 'resize') return { op, cols: anyNumber(rand), rows: anyNumber(rand) };
	return { op, chars: anyNumber(rand) };
}

/** The wire text for a generated value: JSON most of the time, raw or broken text otherwise. */
export function anyWireText(rand) {
	const roll = rand();
	if (roll < 0.05) return anyString(rand);
	if (roll > 0.7) return JSON.stringify(nearCommand(rand));
	const text = JSON.stringify(anyCommandValue(rand));
	if (roll < 0.1) return text.slice(0, Math.floor(rand() * text.length));
	return text;
}
