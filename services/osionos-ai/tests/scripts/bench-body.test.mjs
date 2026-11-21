// Fake SSE server + the real bench: body shape (finding 3) and R24 (finding 5).
// Run: docker run --rm -v "$PWD:/code" -w /code node:22-bookworm-slim node tests/scripts/bench-body.test.mjs
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// async: execFileSync would block the loop that serves the fake endpoint
const run = promisify(execFile);

const bodies = [];
let mode = 'content';
const sse = (o) => `data: ${JSON.stringify(o)}\n\n`;
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.url.endsWith('/chat/completions')) bodies.push(JSON.parse(raw));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (mode === 'content') res.write(sse({ choices: [{ delta: { content: 'hi there' } }] }));
    res.write(sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 2 } }));
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const bench = async (args, env = {}) => JSON.parse((await run('node', ['scripts/bench/llm-bench-gpu.mjs', ...args], {
  env: { ...process.env, WARMUP: '0', ...env }, timeout: 60000,
})).stdout);

bodies.length = 0;
const plain = await bench(['--base-url', base, '--model', 'm', '--n', '2', '--plain']);
assert.ok(bodies.length >= 2, 'sent requests');
for (const b of bodies) assert.ok(!('tools' in b) && !('cache_prompt' in b), 'plain remote body is plain chat');
assert.equal(plain.successRate, 1);

bodies.length = 0;
await bench(['--base-url', base, '--model', 'm', '--n', '1']);
for (const b of bodies) assert.ok('tools' in b && !('cache_prompt' in b), 'remote without --plain keeps tools, no cache_prompt');

bodies.length = 0;
await bench(['--model', 'm', '--n', '1'], { LLM_URL: base });
for (const b of bodies) assert.ok('tools' in b && b.cache_prompt === true, 'spike (local) body unchanged');

mode = 'empty';
const empty = await bench(['--base-url', base, '--model', 'm', '--n', '2', '--plain']);
assert.equal(empty.successRate, 0, 'a stream with no content part is a failure');
server.close();
console.log('bench-body ok');
