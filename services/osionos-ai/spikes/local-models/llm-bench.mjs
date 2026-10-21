// llama.cpp server benchmark (AI-P0c, measure only).
// Pure Node 22 (no npm deps, global fetch). Run inside a node:22 container on ai-dev-net.
//   node llm-bench.mjs
// Env:
//   LLM_URL   base url of the llama.cpp server (default http://ai-dev-llm:8080)
//   STREAMS   streamed chat completions for (b)   (default 5)
//   CONC      concurrent streams for (d)           (default 4)
//
// Protocol (fixed, never re-tuned to pass):
//   (a) GET /v1/models
//   (b) STREAMS streamed chat completions, ~300-token prompt, max_tokens 200
//       -> TTFT p50, decode tok/s, prompt tok/s (server `timings` when present, else measured)
//   (c) one tool-call round trip: tool get_weather({city}), "What is the weather in Paris? Use the tool."
//   (d) CONC concurrent streams -> aggregate tokens/s

const BASE = (process.env.LLM_URL || 'http://ai-dev-llm:8080').replace(/\/$/, '');
const STREAMS = Number(process.env.STREAMS || 5);
const CONC = Number(process.env.CONC || 4);

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261021);
const WORDS = ('please summarize the following engineering context for the release review meeting ' +
  'the ingestion pipeline writes normalised rows into the workspace store and the embedding ' +
  'service computes vectors for every passage so the retrieval index can rank candidates ' +
  'the gateway proxies streaming completions and forwards tool calls to the model runtime ' +
  'latency budgets are reviewed every sprint and regressions are triaged by the platform team ' +
  'please list the three most important risks and give a one paragraph mitigation plan for each ' +
  'include the owner team and the expected effect on the release timeline').split(' ');

function makePrompt(words) {
  const out = [];
  for (let i = 0; i < words; i++) out.push(WORDS[Math.floor(rng() * WORDS.length)]);
  return out.join(' ');
}

function pct(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

async function tokenCount(content) {
  const res = await fetch(`${BASE}/tokenize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`POST /tokenize -> ${res.status}`);
  const json = await res.json();
  if (Array.isArray(json.tokens)) return json.tokens.length;
  if (Array.isArray(json.token_ids)) return json.token_ids.length;
  return -1;
}

// Parse an SSE body into parsed JSON objects (data: lines only).
async function* sseObjects(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try { yield JSON.parse(payload); } catch { /* ignore non-json keepalive */ }
      }
    }
  }
}

// ---------------------------------------------------------------- (a) models
console.log('== (a) GET /v1/models ==');
const modelsRes = await fetch(`${BASE}/v1/models`);
if (!modelsRes.ok) {
  console.error(`llama.cpp not ready: GET /v1/models -> ${modelsRes.status}`);
  process.exit(1);
}
const modelsJson = await modelsRes.json();
console.log(JSON.stringify(modelsJson, null, 2));
const MODEL = modelsJson.data?.[0]?.id;
if (!MODEL) { console.error('no model id in /v1/models'); process.exit(1); }
console.log(`model id used: ${MODEL}`);

// ---------------------------------------------------------------- prompt calibration (~300 tokens)
let promptWords = 220;
let promptTokens = await tokenCount(makePrompt(promptWords));
for (let i = 0; i < 10; i++) {
  if (Math.abs(promptTokens - 300) <= 10) break;
  promptWords = Math.max(20, Math.min(2000, Math.round(promptWords + (300 - promptTokens) / 1.35)));
  promptTokens = await tokenCount(makePrompt(promptWords));
}
console.log(`\nprompt calibration: ${promptWords} words -> ${promptTokens} tokens (target ~300)`);

// ---------------------------------------------------------------- one streamed chat completion
async function streamChat(body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /v1/chat/completions -> ${res.status}: ${text.slice(0, 500)}`);
  }
  const ttftMs = null;
  let firstContentAt = null;
  let lastAt = null;
  let contentChars = 0;
  let contentChunks = 0;
  let usage = null;
  let timings = null;
  let finishReason = null;
  const toolCalls = [];
  let toolAcc = new Map();

  for await (const obj of sseObjects(res)) {
    const now = performance.now();
    if (obj.usage) usage = obj.usage;
    if (obj.timings) timings = obj.timings;
    const choice = obj.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || {};
    const text = delta.content;
    if (typeof text === 'string' && text.length > 0) {
      if (firstContentAt === null) firstContentAt = now;
      contentChars += text.length;
      contentChunks += 1;
      lastAt = now;
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolAcc.has(idx)) toolAcc.set(idx, { id: null, type: null, name: null, args: '' });
        const acc = toolAcc.get(idx);
        if (tc.id) acc.id = tc.id;
        if (tc.type) acc.type = tc.type;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
    }
  }
  const endAt = performance.now();
  for (const [idx, acc] of toolAcc) toolCalls.push({ index: idx, ...acc });
  void ttftMs;
  return {
    ttftMs: firstContentAt === null ? NaN : firstContentAt - t0,
    totalMs: endAt - t0,
    decodeMs: firstContentAt === null ? endAt - t0 : endAt - firstContentAt,
    contentChars,
    contentChunks,
    usage,
    timings,
    finishReason,
    toolCalls,
    headers: {},
  };
}

// ---------------------------------------------------------------- (b) streamed chat completions
console.log(`\n== (b) STREAMED CHAT COMPLETIONS (n=${STREAMS}, max_tokens=200) ==`);
const results = [];
for (let i = 0; i < STREAMS; i++) {
  const r = await streamChat({
    model: MODEL,
    messages: [{ role: 'user', content: makePrompt(promptWords) }],
    stream: true,
    max_tokens: 200,
    stream_options: { include_usage: true },
  });
  results.push(r);
  const promptToks = r.usage?.prompt_tokens ?? r.timings?.prompt_n ?? promptTokens;
  const outToks = r.usage?.completion_tokens ?? r.timings?.predicted_n ?? null;
  const srvDecode = r.timings ? r.timings.predicted_per_second : null;
  const srvPrompt = r.timings ? r.timings.prompt_per_second : null;
  const measDecode = outToks && Number.isFinite(r.decodeMs) ? outToks / (r.decodeMs / 1000) : null;
  const measPrompt = Number.isFinite(r.ttftMs) ? promptToks / (r.ttftMs / 1000) : null;
  console.log(
    `  run ${i + 1}: TTFT=${fmt(r.ttftMs)} ms  total=${fmt(r.totalMs)} ms  chunks=${r.contentChunks}  ` +
    `prompt_tok=${promptToks}  out_tok=${outToks ?? 'n/a'}  finish=${r.finishReason}`,
  );
  console.log(
    `          decode=${fmt(srvDecode ?? measDecode)} tok/s (server=${fmt(srvDecode)}${srvDecode ? '' : ' / measured'})  ` +
    `prompt=${fmt(srvPrompt ?? measPrompt)} tok/s (server=${fmt(srvPrompt)}${srvPrompt ? '' : ' / measured'})`,
  );
  if (r.timings) console.log(`          timings=${JSON.stringify(r.timings)}`);
  if (r.usage) console.log(`          usage=${JSON.stringify(r.usage)}`);
}

const ttfts = results.map((r) => r.ttftMs).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
const outToksArr = results.map((r) => r.usage?.completion_tokens ?? r.timings?.predicted_n ?? null);
const srvDecodeArr = results.map((r) => (r.timings ? r.timings.predicted_per_second : null)).filter((v) => v !== null && Number.isFinite(v));
const measDecodeArr = results.map((r, i) => {
  const o = outToksArr[i];
  return o && Number.isFinite(r.decodeMs) ? o / (r.decodeMs / 1000) : null;
}).filter((v) => v !== null && Number.isFinite(v));
const srvPromptArr = results.map((r) => (r.timings ? r.timings.prompt_per_second : null)).filter((v) => v !== null && Number.isFinite(v));
const measPromptArr = results.map((r, i) => {
  const p = r.usage?.prompt_tokens ?? r.timings?.prompt_n ?? promptTokens;
  return Number.isFinite(r.ttftMs) ? p / (r.ttftMs / 1000) : null;
}).filter((v) => v !== null && Number.isFinite(v));

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const ttftP50 = pct(ttfts, 50);
const decodeServer = avg(srvDecodeArr);
const decodeMeasured = avg(measDecodeArr);
const promptServer = avg(srvPromptArr);
const promptMeasured = avg(measPromptArr);

console.log(`TTFT p50 = ${fmt(ttftP50)} ms (all: ${ttfts.map((v) => fmt(v)).join(', ')})`);
console.log(`decode tok/s  server=${fmt(decodeServer)}  measured=${fmt(decodeMeasured)}`);
console.log(`prompt tok/s  server=${fmt(promptServer)}  measured=${fmt(promptMeasured)}`);

// ---------------------------------------------------------------- (c) tool-call round trip
console.log('\n== (c) TOOL-CALL ROUND TRIP ==');
const toolRes = await streamChat({
  model: MODEL,
  messages: [{ role: 'user', content: 'What is the weather in Paris? Use the tool.' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a city.',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name, e.g. Paris' } },
          required: ['city'],
        },
      },
    },
  ],
  tool_choice: 'auto',
  stream: true,
  max_tokens: 200,
});
console.log(`  finish_reason: ${toolRes.finishReason}`);
for (const tc of toolRes.toolCalls) {
  console.log(`  tool_call: name=${tc.name} args=${tc.args}`);
}
const toolCall = toolRes.toolCalls.find((t) => t.name === 'get_weather');
let argsObj = null;
if (toolCall && toolCall.args) {
  try { argsObj = JSON.parse(toolCall.args); } catch { argsObj = null; }
}
const toolPass = Boolean(toolCall) && Boolean(argsObj) && typeof argsObj.city === 'string' && /paris/i.test(argsObj.city);
console.log(`  parsed arguments: ${JSON.stringify(argsObj)}`);
console.log(`  TOOL CALL (get_weather with Paris): ${toolPass ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------- (d) concurrent streams
console.log(`\n== (d) CONCURRENT STREAMS (concurrency=${CONC}) ==`);
const t0 = performance.now();
const conc = await Promise.all(
  Array.from({ length: CONC }, async (_, i) => {
    const r = await streamChat({
      model: MODEL,
      messages: [{ role: 'user', content: makePrompt(promptWords) }],
      stream: true,
      max_tokens: 200,
      stream_options: { include_usage: true },
    });
    const o = r.usage?.completion_tokens ?? r.timings?.predicted_n ?? 0;
    console.log(`  stream ${i + 1}: TTFT=${fmt(r.ttftMs)} ms total=${fmt(r.totalMs)} ms out_tok=${o} chunks=${r.contentChunks}`);
    return { ...r, outToks: o };
  }),
);
const wall = (performance.now() - t0) / 1000;
const totalOut = conc.reduce((a, r) => a + (r.outToks || 0), 0);
const aggDecode = totalOut / wall;
console.log(`  wall=${fmt(wall)} s  total completion tokens=${totalOut}  aggregate=${fmt(aggDecode)} tok/s`);
const concTTFT = conc.map((r) => r.ttftMs).sort((a, b) => a - b);
console.log(`  concurrent TTFT p50=${fmt(pct(concTTFT, 50))} ms p95=${fmt(pct(concTTFT, 95))} ms`);

// ---------------------------------------------------------------- summary
console.log('\n== SUMMARY ==');
console.log(`GATE llama tool call round trip: ${toolPass ? 'PASS' : 'FAIL'}`);
console.log(`llama decode: ${fmt(decodeServer > 0 ? decodeServer : decodeMeasured)} tok/s, TTFT p50 ${fmt(ttftP50)} ms`);
console.log(`llama prompt: ${fmt(promptServer > 0 ? promptServer : promptMeasured)} tok/s`);
console.log(`llama concurrent(${CONC}) aggregate: ${fmt(aggDecode)} tok/s`);
