// Gateway proxy under test: receives POST /run {prompt}, calls streamText()
// against the mock upstream through the Vercel AI SDK openai-compatible
// adapter, and re-emits our own SSE:
//   id: <n>\nevent: text.delta\ndata: {"text":"..."}\n\n   per text delta
//   event: done\ndata: {"usage":{...}}\n\n                 at the end
import http from 'node:http';
import { streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const HOST = '127.0.0.1';
const PORT = 4902;
const UPSTREAM_BASE_URL = 'http://127.0.0.1:4901/v1';

const provider = createOpenAICompatible({
  name: 'mock',
  baseURL: UPSTREAM_BASE_URL,
});

// Peak RSS sampling: every 100 ms, keep the max, print on SIGTERM.
let peakRss = 0;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 100);

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/run') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;
  let payload = {};
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad json' }));
    return;
  }

  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'x-accel-buffering': 'no',
  });

  const writeEvent = (str) => {
    if (!res.writableEnded && !res.destroyed) res.write(str);
  };

  const result = streamText({
    model: provider('mock-model'),
    prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
    abortSignal: ac.signal,
  });

  try {
    let n = 0;
    let sawError = null;
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        // v7: part.text; older majors used part.delta / part.textDelta
        const text = part.text ?? part.delta ?? part.textDelta;
        if (text !== undefined) {
          n += 1;
          writeEvent(`id: ${n}\nevent: text.delta\ndata: ${JSON.stringify({ text })}\n\n`);
        }
      } else if (part.type === 'error') {
        sawError = part.error ?? part;
        break;
      }
    }
    if (sawError) throw sawError;
    const usage = await result.usage;
    writeEvent(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
    res.end();
  } catch (err) {
    if (ac.signal.aborted) {
      // client disconnected: upstream aborted, nothing to send
      res.end();
    } else {
      writeEvent(
        `event: error\ndata: ${JSON.stringify({ message: String(err && err.message ? err.message : err) })}\n\n`,
      );
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`proxy listening on http://${HOST}:${PORT}`);
});

const reportAndExit = () => {
  clearInterval(sampler);
  console.log(`PROXY PEAK RSS: ${(peakRss / 1024 / 1024).toFixed(2)} MB (sampled every 100 ms)`);
  process.exit(0);
};
process.on('SIGTERM', reportAndExit);
process.on('SIGINT', reportAndExit);
