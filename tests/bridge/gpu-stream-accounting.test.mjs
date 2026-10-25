import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../services/osionos-ai/spikes/gpu/llm-bench-gpu.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('async function* sseObjects'), source.indexOf('/** The metrics of the server'));
const run = (chunks, broken = false) => {
  const body = new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    if (broken) controller.error(new Error('connection lost')); else controller.close();
  } });
  const runOne = new Function('fetch', 'BASE', `${functions}\nreturn runOne;`)(async () => new Response(body), 'http://synthetic');
  return runOne({});
};
const content = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n';
const finish = 'data: {"choices":[{"finish_reason":"stop"}]}\n\n';

it('counts a completed SSE generation even when frames arrive in pieces', async () => {
  const result = await run([content.slice(0, 12), content.slice(12), finish, 'data: [DONE]\n\n']);
  assert.equal(result.error, undefined);
  assert.equal(result.contentChunks, 1);
  assert.ok(Number.isFinite(result.ttftMs));
});
it('rejects SSE errors after partial content, including event:error with non-JSON data', async () => {
  for (const error of ['data: {"error":{"message":"out of memory"}}\n\n', 'event: error\r\ndata: failed\r\n\r\n', 'event: error\ndata: null\n\n']) {
    const result = await run([content, error, finish]);
    assert.match(result.error, /stream_error/);
    assert.equal(result.totalMs, undefined, 'a failure cannot enter successful latency accounting');
  }
});
it('rejects empty, truncated, and broken streams', async () => {
  for (const result of [await run([]), await run([content]), await run([content], true)]) {
    assert.match(result.error, /stream_(incomplete|failed)/);
    assert.equal(result.contentChunks, undefined, 'failed partial output cannot enter successful token totals');
  }
});
