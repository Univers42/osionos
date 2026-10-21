/* gen.mjs — seeded synthetic data for the AI-P0b retrieval spike.
 *
 *   node gen.mjs members   -> COPY text rows for members
 *   node gen.mjs chunks    -> COPY text rows for ai_chunks
 *
 * No npm deps. Deterministic: every value is a pure function of an index and
 * the fixed seed, so genq.mjs can recompute any chunk's workspace, words and
 * vector without regenerating the whole dataset.
 *
 *   ... | docker exec -i ai-spike-pg psql -U postgres -c "\copy members(...) from stdin"
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';

export const SEED = 42;
export const N_WORKSPACES = 5000;
export const N_CHUNKS = 1_000_000;
export const CHUNKS_PER_PAGE = 4;
export const N_PAGES = N_CHUNKS / CHUNKS_PER_PAGE; // 250_000
export const N_CENTROIDS = 2000;
export const DIM = 384;
export const VOCAB_SIZE = 20000;
export const CHUNK_SIGMA = 0.35;   // chunk = centroid + N(0, 0.35)
export const ZIPF_S = 1.1;

// ---------------------------------------------------------------------------
// PRNG plumbing: per-(label, index) stream from FNV-1a + mulberry32.
// ---------------------------------------------------------------------------
function fnv1a(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function rng(label, i) {
	return mulberry32(fnv1a(`${label}:${i}`) ^ SEED);
}

export function uuidFrom(s) {
	const h = createHash('md5').update(s).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Zipf samplers (CDF + binary search).
// ---------------------------------------------------------------------------
function makeZipf(n, s) {
	const cdf = new Float64Array(n);
	let acc = 0;
	for (let k = 1; k <= n; k++) {
		acc += 1 / Math.pow(k, s);
		cdf[k - 1] = acc;
	}
	return { cdf, total: acc };
}

function zipfPick(z, u) {
	const target = u * z.total;
	let lo = 0;
	let hi = z.cdf.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (z.cdf[mid] < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

export const WS_ZIPF = makeZipf(N_WORKSPACES, ZIPF_S);
export const VOCAB_ZIPF = makeZipf(VOCAB_SIZE, ZIPF_S);

// ---------------------------------------------------------------------------
// Membership model (cheap: no chunk work).
//   - ~2000 "roamers" each join 2-3 workspaces (so some users span 2-3 workspaces)
//   - every workspace is topped up to 1..5 members
// ---------------------------------------------------------------------------
const ROAMERS = 2000;

export function buildMembership() {
	const wsMembers = Array.from({ length: N_WORKSPACES }, () => []);
	const seen = Array.from({ length: N_WORKSPACES }, () => new Set());

	for (let r = 0; r < ROAMERS; r++) {
		const want = 2 + Math.floor(rng('rk', r)() * 2); // 2..3
		const draw = rng('rp', r);
		const picks = new Set();
		let guard = 0;
		while (picks.size < want && guard++ < 64) picks.add(zipfPick(WS_ZIPF, draw()));
		const uid = uuidFrom(`roam:${r}`);
		for (const w of picks) {
			if (seen[w].has(uid)) continue;
			seen[w].add(uid);
			wsMembers[w].push(uid);
		}
	}

	for (let w = 0; w < N_WORKSPACES; w++) {
		const desired = 1 + Math.floor(rng('mc', w)() * 5); // 1..5
		const list = wsMembers[w];
		while (list.length > 5) list.pop();
		let f = 0;
		while (list.length < desired && list.length < 5) {
			list.push(uuidFrom(`fill:${w}:${f++}`));
		}
	}
	return wsMembers;
}

export function userWorkspaces(wsMembers) {
	const byUser = new Map();
	for (let w = 0; w < wsMembers.length; w++) {
		for (const u of wsMembers[w]) {
			let a = byUser.get(u);
			if (!a) byUser.set(u, (a = []));
			a.push(w);
		}
	}
	return byUser;
}

export function workspaceId(w) {
	return uuidFrom(`workspace:${w}`);
}

// ---------------------------------------------------------------------------
// Page attributes: visibility mix 60/25/10/5, owner from the workspace's members,
// 0-3 collaborators. Workspace is Zipf-ranked => chunks are Zipf over workspaces.
// ---------------------------------------------------------------------------
export function pageWorkspace(pageIdx) {
	return zipfPick(WS_ZIPF, rng('pg', pageIdx)());
}

export function pageAttrs(pageIdx, wsMembers) {
	const r = rng('pgattr', pageIdx);
	const w = pageWorkspace(pageIdx);
	const v = r();
	let visibility;
	if (v < 0.6) visibility = 'shared';
	else if (v < 0.85) visibility = 'private';
	else if (v < 0.95) visibility = 'public';
	else visibility = null; // null -> private (l.27-29)

	const members = wsMembers[w];
	const owner = r() < 0.05 ? null : members[Math.floor(r() * members.length)];
	const nCollab = Math.floor(r() * 4); // 0..3
	const collabs = [];
	const set = new Set();
	for (let i = 0; i < nCollab; i++) {
		const c = members[Math.floor(r() * members.length)];
		if (!set.has(c)) {
			set.add(c);
			collabs.push(c);
		}
	}
	return {
		workspaceId: workspaceId(w),
		pageId: uuidFrom(`page:${pageIdx}`),
		owner,
		visibility,
		collabs,
	};
}

export function pageIndex(chunkIdx) {
	return Math.floor(chunkIdx / CHUNKS_PER_PAGE);
}

// ---------------------------------------------------------------------------
// Text: fixed 20k pseudo-word vocabulary, drawn by Zipf (s=1.1).
// ---------------------------------------------------------------------------
const CONSONANTS = 'bcdfghjklmnpqrstvwz';
const VOWELS = 'aeiou';

export function vocabWord(i) {
	const r = rng('word', i);
	const n = 4 + Math.floor(r() * 5); // 4..8 letters
	let s = '';
	for (let j = 0; j < n; j++) {
		s += j % 2 === 0
			? CONSONANTS[Math.floor(r() * CONSONANTS.length)]
			: VOWELS[Math.floor(r() * VOWELS.length)];
	}
	return s;
}

export const VOCAB = Array.from({ length: VOCAB_SIZE }, (_, i) => vocabWord(i));

export function chunkHeadingPath(chunkIdx) {
	const r = rng('ch', chunkIdx);
	const n = 1 + Math.floor(r() * 3); // 1..3 words
	const out = [];
	for (let i = 0; i < n; i++) out.push(VOCAB[zipfPick(VOCAB_ZIPF, r())]);
	return out.join(' ');
}

export function chunkWords(chunkIdx) {
	const count = 40 + Math.floor(rng('ct', chunkIdx)() * 81); // 40..120 words
	const draw = rng('cz', chunkIdx);
	const out = new Array(count);
	for (let i = 0; i < count; i++) out[i] = VOCAB[zipfPick(VOCAB_ZIPF, draw())];
	return out;
}

// ---------------------------------------------------------------------------
// Embeddings: 2000 random unit centroids; chunk = centroid + N(0, sigma), normalised.
// ---------------------------------------------------------------------------
const centroidCache = new Map();

function normalise(v) {
	let s = 0;
	for (let i = 0; i < v.length; i++) s += v[i] * v[i];
	const inv = 1 / Math.sqrt(s);
	for (let i = 0; i < v.length; i++) v[i] *= inv;
	return v;
}

function gaussStream(r) {
	let spare = null;
	return function () {
		if (spare !== null) {
			const s = spare;
			spare = null;
			return s;
		}
		const u1 = Math.max(r(), 1e-12);
		const u2 = r();
		const mag = Math.sqrt(-2 * Math.log(u1));
		const t = 2 * Math.PI * u2;
		spare = mag * Math.sin(t);
		return mag * Math.cos(t);
	};
}

export function centroidVec(k) {
	let c = centroidCache.get(k);
	if (c) return c;
	const g = gaussStream(rng('cen', k));
	const v = new Float64Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = g();
	c = normalise(v);
	if (centroidCache.size < N_CENTROIDS) centroidCache.set(k, c);
	return c;
}

export function chunkCentroidIndex(chunkIdx) {
	return Math.floor(rng('cv', chunkIdx)() * N_CENTROIDS);
}

/** The chunk's own vector: centroid + N(0, CHUNK_SIGMA) noise, normalised. */
export function chunkVector(chunkIdx) {
	const c = centroidVec(chunkCentroidIndex(chunkIdx));
	const g = gaussStream(rng('cvn', chunkIdx));
	const v = new Float64Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = c[i] + CHUNK_SIGMA * g();
	return normalise(v);
}

/** A query vector derived from an existing chunk: chunk + N(0, sigma) noise, normalised. */
export function queryVectorNear(chunkIdx, queryIdx, sigma) {
	const base = chunkVector(chunkIdx);
	const g = gaussStream(rng('qv', queryIdx));
	const v = new Float64Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = base[i] + sigma * g();
	return normalise(v);
}

// ---------------------------------------------------------------------------
// COPY text formatting.
// ---------------------------------------------------------------------------
export function vecLiteral(v) {
	let s = '[';
	for (let i = 0; i < v.length; i++) {
		if (i) s += ',';
		s += v[i].toFixed(4);
	}
	return s + ']';
}

function arrLiteral(ids) {
	return `{${ids.join(',')}}`;
}

/** Write one batch, awaiting 'drain' when stdout's buffer is full.
 *  Without this a tight generation loop queues writes faster than docker's attach
 *  socket drains and Node dies with `write ENOBUFS`. */
async function flush(out, text) {
	if (text.length === 0) return;
	if (!out.write(text)) await once(out, 'drain');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function writeMembers(out) {
	const wsMembers = buildMembership();
	let buf = '';
	for (let w = 0; w < N_WORKSPACES; w++) {
		const wid = workspaceId(w);
		for (const u of wsMembers[w]) {
			buf += `${wid}\t${u}\n`;
			if (buf.length > 1 << 16) {
				await flush(out, buf);
				buf = '';
			}
		}
	}
	await flush(out, buf);
}

async function writeChunks(out) {
	const wsMembers = buildMembership();
	let buf = '';
	let rows = 0;
	let cachedPage = -1;
	let cachedAttrs = null;
	for (let i = 0; i < N_CHUNKS; i++) {
		const pIdx = pageIndex(i);
		if (pIdx !== cachedPage) {
			cachedPage = pIdx;
			cachedAttrs = pageAttrs(pIdx, wsMembers); // 4 chunks share a page's attributes
		}
		const a = cachedAttrs;
		const heading = chunkHeadingPath(i);
		const words = chunkWords(i);
		const content = words.join(' ');
		buf +=
			`${a.workspaceId}\t${a.pageId}\t${a.owner ?? '\\N'}\t${a.visibility ?? '\\N'}\t` +
			`${arrLiteral(a.collabs)}\t${heading}\t${content}\t${vecLiteral(chunkVector(i))}\n`;
		if (++rows >= 200) {
			await flush(out, buf);
			buf = '';
			rows = 0;
		}
	}
	await flush(out, buf);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	process.stdout.on('error', (err) => {
		if (err.code === 'EPIPE') process.exit(0);
		process.stderr.write(`gen.mjs: stdout error: ${err.code ?? err.message}\n`);
		process.exit(1);
	});
	const mode = process.argv[2];
	if (mode === 'members') await writeMembers(process.stdout);
	else if (mode === 'chunks') await writeChunks(process.stdout);
	else {
		process.stderr.write('usage: node gen.mjs members|chunks\n');
		process.exit(2);
	}
}
