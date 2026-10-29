// TEI benchmark (AI-P0c, measure only).
// Pure Node 22 (no npm deps, global fetch). Run inside a node:22 container.
//   node tei-bench.mjs
// Env:
//   TEI_URL   base url of the TEI router      (default http://127.0.0.1:4911)
//   QUERIES  sequential query samples          (default 300)
//   PASSAGES backfill passages                 (default 20000)
//   BATCH    passages per /embed request       (default 32)
//   CONC     backfill concurrency              (default 4)
//   CONC16   concurrent single-query concurrency (default 16)
//
// Protocol (fixed, never re-tuned to pass):
//   (a) QUERIES sequential single-request queries, one at a time
//   (b) PASSAGES passages of ~350 tokens, batches of BATCH, CONC requests in flight
//   (c) CONC16 concurrent single-request queries
//   sanity: cosine(query, relevant passage) must beat cosine(query, irrelevant passage)

const BASE = (process.env.TEI_URL || 'http://127.0.0.1:4911').replace(/\/$/, '');
const QUERIES = Number(process.env.QUERIES || 300);
const PASSAGES = Number(process.env.PASSAGES || 20000);
const BATCH = Number(process.env.BATCH || 32);
const CONC = Number(process.env.CONC || 4);
const CONC16 = Number(process.env.CONC16 || 16);

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ('deal pipeline quarter revenue churn onboarding invoice contract renewal procurement ' +
  'compliance dashboard stakeholder scope milestone backlog customer cohort activation ' +
  'retention forecast margin headcount roadmap dispute escalation approval workflow ' +
  'subscription tenant sandbox cluster latency throughput capacity rollout ' +
  'integration webhook partner enterprise discount benchmark').split(' ');

function makeRng(seed) {
  // returns a float in [0, 1)
  return mulberry32(seed);
}

// nearest-rank percentile over a copy of the samples (same convention as P0a)
function pct(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

function summarize(label, samples) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    label,
    n: s.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    min: s[0],
    max: s[s.length - 1],
    mean: sum / s.length,
  };
}
function printSummary(s) {
  console.log(
    `${s.label.padEnd(34)} n=${String(s.n).padEnd(6)} p50=${fmt(s.p50)} ms  p95=${fmt(s.p95)} ms  ` +
    `p99=${fmt(s.p99)} ms  min=${fmt(s.min)}  max=${fmt(s.max)}  mean=${fmt(s.mean)}`,
  );
}

async function postEmbed(inputs) {
  const res = await fetch(`${BASE}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /embed -> ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = await res.json();
  // TEI 1.9.4 answers with a bare array of embeddings; older builds wrap it in
  // {embeddings: [...]}. Accept both.
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.embeddings)) return json.embeddings;
  throw new Error(`unexpected /embed shape: ${JSON.stringify(json).slice(0, 200)}`);
}

async function tokenCount(text) {
  const res = await fetch(`${BASE}/tokenize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs: text }),
  });
  if (!res.ok) throw new Error(`POST /tokenize -> ${res.status}`);
  const json = await res.json();
  // TEI 1.9.4 answers with a bare array of token lists; older builds wrap it in
  // {token_ids: [...]}. Accept both.
  if (Array.isArray(json)) {
    if (Array.isArray(json[0])) return json[0].length;
    if (typeof json[0] === 'number') return json.length;
    return -1;
  }
  if (json && Array.isArray(json.token_ids)) return json.token_ids.length;
  return -1;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------- start
const infoRes = await fetch(`${BASE}/info`);
if (!infoRes.ok) {
  console.error(`TEI not ready: GET /info -> ${infoRes.status}`);
  process.exit(1);
}
const info = await infoRes.json();
console.log('== TEI /info ==');
console.log(JSON.stringify(info, null, 2));

const health = await (await fetch(`${BASE}/health`)).text().catch(() => '');
console.log(`TEI /health: ${health.trim() || '(empty)'}`);

// ---------------------------------------------------------------- (a) sequential query latency
const rng = makeRng(20261021);
function makeQuery() {
  const words = 8 + Math.floor(rng() * 8); // 8..15 words
  const out = [];
  for (let i = 0; i < words; i++) out.push(WORDS[Math.floor(rng() * WORDS.length)]);
  return `query: ${out.join(' ')}`;
}

// warm-up (discarded): 10 single queries, same protocol
for (let i = 0; i < 10; i++) await postEmbed(makeQuery());

console.log(`\n== (a) QUERY LATENCY (sequential, n=${QUERIES}) ==`);
const seqLat = [];
for (let i = 0; i < QUERIES; i++) {
  const t0 = performance.now();
  await postEmbed(makeQuery());
  seqLat.push(performance.now() - t0);
  if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/${QUERIES} queries done`);
}
const seqSum = summarize('sequential query', seqLat);
printSummary(seqSum);
const sampleQuery = makeQuery();
console.log(`sample query: "${sampleQuery}" (${sampleQuery.trim().split(/\s+/).length} words)`);

// ---------------------------------------------------------------- token calibration for passages
// Find the word count whose tokenized length is ~350 tokens with this model's tokenizer.
const passageRng = makeRng(4242);
function makePassage(nWords) {
  const out = [];
  for (let i = 0; i < nWords; i++) out.push(WORDS[Math.floor(passageRng() * WORDS.length)]);
  return `passage: ${out.join(' ')}`;
}
let calWords = 260;
let calTokens = await tokenCount(makePassage(calWords));
for (let iter = 0; iter < 12; iter++) {
  if (Math.abs(calTokens - 350) <= 8) break;
  const delta = (350 - calTokens) / 1.3; // ~1.3 tokens/word for this tokenizer
  calWords = Math.max(20, Math.min(2000, Math.round(calWords + delta)));
  calTokens = await tokenCount(makePassage(calWords));
}
console.log(`\n== PASSAGE CALIBRATION ==`);
console.log(`calibrated word count: ${calWords} -> ${calTokens} tokens (target 350)`);
const samplePassage = makePassage(calWords);
console.log(`sample passage (first 160 chars): "${samplePassage.slice(0, 160)}..."`);

// measure the real token length over a sample of the passages we will actually send
const tokenSample = [];
for (let i = 0; i < 25; i++) tokenSample.push(await tokenCount(makePassage(calWords)));
const meanTokens = tokenSample.reduce((a, b) => a + b, 0) / tokenSample.length;
console.log(`measured tokens/passage over 25 samples: mean=${fmt(meanTokens, 1)} min=${Math.min(...tokenSample)} max=${Math.max(...tokenSample)}`);

// ---------------------------------------------------------------- (b) backfill throughput
const passages = new Array(PASSAGES);
for (let i = 0; i < PASSAGES; i++) passages[i] = makePassage(calWords);
const batches = [];
for (let i = 0; i < PASSAGES; i += BATCH) batches.push(passages.slice(i, i + BATCH));

console.log(`\n== (b) BACKFILL (${PASSAGES} passages x ~${fmt(meanTokens, 0)} tokens, batch=${BATCH}, concurrency=${CONC}) ==`);
let done = 0;
let donePassages = 0;
const totalBatches = batches.length;
const tBackfill0 = performance.now();
await Promise.all(
  Array.from({ length: CONC }, async () => {
    for (;;) {
      const b = batches.pop();
      if (!b) return;
      await postEmbed(b);
      done += 1;
      donePassages += b.length;
      if (done % 25 === 0) {
        const el = (performance.now() - tBackfill0) / 1000;
        console.log(`  ... ${done}/${totalBatches} batches (${donePassages}/${PASSAGES} passages) ${fmt(donePassages / el, 1)} chunks/s`);
      }
    }
  }),
);
const backfillMs = performance.now() - tBackfill0;
const chunksPerSec = PASSAGES / (backfillMs / 1000);
console.log(`backfill total: ${fmt(backfillMs / 1000)} s for ${PASSAGES} passages -> ${fmt(chunksPerSec, 2)} chunks/s`);

// ---------------------------------------------------------------- (c) concurrency 16
console.log(`\n== (c) CONCURRENT SINGLE QUERIES (concurrency=${CONC16}, n=${QUERIES}) ==`);
const c16Lat = [];
let c16Done = 0;
await Promise.all(
  Array.from({ length: CONC16 }, async () => {
    for (;;) {
      const i = c16Done;
      if (i >= QUERIES) return;
      c16Done += 1;
      const t0 = performance.now();
      await postEmbed(makeQuery());
      c16Lat.push(performance.now() - t0);
    }
  }),
);
const c16Sum = summarize(`concurrency-${CONC16} query`, c16Lat);
printSummary(c16Sum);

// ---------------------------------------------------------------- sanity: cosine ranking
console.log('\n== SANITY (cosine) ==');
const qText = 'query: how many deals close this quarter';
const pRel = 'passage: Deals closing in Q4: Acme 60,000 EUR';
const pIrr = 'passage: The cat sat on the mat';
const [qe, peRel, peIrr] = await postEmbed([qText, pRel, pIrr]);
const dim = qe.length;
const cRel = cosine(qe, peRel);
const cIrr = cosine(qe, peIrr);
console.log(`embedding dim: ${dim}`);
console.log(`cosine(query, relevant)   = ${fmt(cRel, 6)}`);
console.log(`cosine(query, irrelevant) = ${fmt(cIrr, 6)}`);
const sanityPass = cRel > cIrr;
console.log(`SANITY (relevant > irrelevant): ${sanityPass ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------- summary
console.log('\n== SUMMARY ==');
console.log(`GATE TEI query p95 < 30 ms: ${seqSum.p95 < 30 ? 'PASS' : 'FAIL'} (${fmt(seqSum.p95)})`);
console.log(`TEI backfill: ${fmt(chunksPerSec, 2)} chunks/s`);
console.log(`TEI concurrency-${CONC16} query p95: ${fmt(c16Sum.p95)} ms`);
console.log(`TEI sequential query p50/p95/p99: ${fmt(seqSum.p50)} / ${fmt(seqSum.p95)} / ${fmt(seqSum.p99)} ms`);
console.log(`TEI embedding dim: ${dim}  sanity: ${sanityPass ? 'PASS' : 'FAIL'}`);
