// Measures TTFT (request start -> first text byte of content) and total time
// for (a) DIRECT: POST to the mock upstream, SSE parsed by hand, and
// (b) PROXIED: POST through the AI SDK gateway proxy.
// Protocol: 20 warm-up requests each (discarded), 200 sequential requests each,
// then 4 rounds of 50 concurrent requests each. Percentiles: nearest-rank.
import { performance } from 'node:perf_hooks';

const DIRECT_URL = 'http://127.0.0.1:4901/v1/chat/completions';
const PROXY_URL = 'http://127.0.0.1:4902/run';

const WARMUP_COUNT = 20;
const SEQ_COUNT = 200;
const CONC_ROUNDS = 4;
const CONC_SIZE = 50;

const BODY = JSON.stringify({ prompt: 'benchmark prompt' });
const headers = { 'content-type': 'application/json' };

// --- SSE handling -----------------------------------------------------------

// Parses the NEXT complete SSE event block from `buf` (only when complete).
// A block ends at the first "\n\n". Returns [block, rest] or [null, buf].
const nextBlock = (buf) => {
  const idx = buf.indexOf('\n\n');
  if (idx < 0) return [null, buf];
  return [buf.slice(0, idx), buf.slice(idx + 2)];
};

const dataLines = (block) =>
  block.split('\n').filter((l) => l.startsWith('data:'));

async function runDirect() {
  const t0 = performance.now();
  const res = await fetch(DIRECT_URL, { method: 'POST', headers, body: BODY });
  if (!res.ok) throw new Error(`direct HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let ttft = null;
  let usage = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const [block, rest] = nextBlock(buf);
      if (block === null) break;
      buf = rest;
      for (const line of dataLines(block)) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const obj = JSON.parse(data);
        const text = obj.choices?.[0]?.delta?.content;
        if (text && ttft === null) {
          ttft = performance.now() - t0;
        }
        if (obj.usage) usage = obj.usage;
      }
    }
  }
  const total = performance.now() - t0;
  if (ttft === null) throw new Error('direct: no content seen');
  return { ttft, total, usage };
}

async function runProxied() {
  const t0 = performance.now();
  const res = await fetch(PROXY_URL, { method: 'POST', headers, body: BODY });
  if (!res.ok) throw new Error(`proxied HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let ttft = null;
  let usage = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const [block, rest] = nextBlock(buf);
      if (block === null) break;
      buf = rest;
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      const kind = eventLine ? eventLine.slice(6).trim() : 'message';
      if (kind === 'text.delta') {
        const { text } = JSON.parse(data);
        if (text && ttft === null) ttft = performance.now() - t0;
      } else if (kind === 'done') {
        usage = JSON.parse(data).usage;
      } else if (kind === 'error') {
        throw new Error(`proxied stream error: ${data}`);
      }
    }
  }
  const total = performance.now() - t0;
  if (ttft === null) throw new Error('proxied: no content seen');
  return { ttft, total, usage };
}

// --- stats ------------------------------------------------------------------

const pctNearestRank = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
};
const ms = (v) => `${v.toFixed(2)} ms`;

async function phase(kind, run, count, mode) {
  // mode: 'sequential' -> one after another; 'concurrent' -> CONC_ROUNDS batches
  // of count/CONC_ROUNDS in-flight requests, batches run back to back.
  const samples = [];
  if (mode === 'sequential') {
    for (let i = 0; i < count; i++) samples.push(await run());
  } else {
    for (let r = 0; r < CONC_ROUNDS; r++) {
      await Promise.all(
        Array.from({ length: count / CONC_ROUNDS }, async () => {
          samples.push(await run());
        }),
      );
    }
  }
  console.log(
    `collected ${mode} ${kind}: n=${samples.length}`,
  );
  return samples;
}

function table(title, direct, proxied) {
  console.log(`\n== ${title} (n=${direct.length} each) ==`);
  console.log('metric   direct_p50  direct_p95  direct_p99  proxied_p50 proxied_p95 proxied_p99 overhead_p50 overhead_p95 overhead_p99');
  for (const [label, pick] of [['TTFT ', (s) => s.ttft], ['TOTAL', (s) => s.total]]) {
    const cells = {};
    for (const p of [50, 95, 99]) {
      const d = pctNearestRank(direct.map(pick), p);
      const x = pctNearestRank(proxied.map(pick), p);
      cells[p] = { d, x, ov: x - d };
    }
    console.log(
      `${label}  ${ms(cells[50].d).padEnd(12)}${ms(cells[95].d).padEnd(12)}${ms(cells[99].d).padEnd(12)}` +
      `${ms(cells[50].x).padEnd(12)}${ms(cells[95].x).padEnd(12)}${ms(cells[99].x).padEnd(12)}` +
      `${ms(cells[50].ov).padEnd(13)}${ms(cells[95].ov).padEnd(13)}${ms(cells[99].ov).padEnd(13)}`,
    );
  }
}

// --- main -------------------------------------------------------------------

// Warm-up: 20 requests each, discarded.
console.log(`warm-up: ${WARMUP_COUNT} direct + ${WARMUP_COUNT} proxied (discarded)`);
for (let i = 0; i < WARMUP_COUNT; i++) await runDirect();
for (let i = 0; i < WARMUP_COUNT; i++) await runProxied();

// Sequential: 200 each.
const seqDirect = await phase('direct', runDirect, SEQ_COUNT, 'sequential');
const seqProxied = await phase('proxied', runProxied, SEQ_COUNT, 'sequential');
table('SEQUENTIAL', seqDirect, seqProxied);

// Concurrent: 4 rounds of 50 each.
const concDirect = await phase('direct', runDirect, CONC_ROUNDS * CONC_SIZE, 'concurrent');
const concProxied = await phase('proxied', runProxied, CONC_ROUNDS * CONC_SIZE, 'concurrent');
table('CONCURRENT', concDirect, concProxied);

const p95SeqTtft = pctNearestRank(seqProxied.map((s) => s.ttft), 95) - pctNearestRank(seqDirect.map((s) => s.ttft), 95);
const p95ConcTtft = pctNearestRank(concProxied.map((s) => s.ttft), 95) - pctNearestRank(concDirect.map((s) => s.ttft), 95);
console.log(`\nGATE overhead p95 TTFT: sequential ${p95SeqTtft.toFixed(2)} ms | concurrent ${p95ConcTtft.toFixed(2)} ms (threshold 15 ms)`);
