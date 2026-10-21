// Mock OpenAI-compatible streaming upstream. Deterministic: fixed ids, fixed
// words, fixed timing (100 ms pre-roll, 64 chunks 5 ms apart). No randomness.
import http from 'node:http';

const HOST = '127.0.0.1';
const PORT = 4901;

const WORD_COUNT = 64;
const FIRST_CHUNK_DELAY_MS = 100;
const CHUNK_GAP_MS = 5;

// Deterministic words: "w0 w1 ... w63"
const chunkSpecs = [];
for (let i = 0; i < WORD_COUNT; i++) {
  const isLast = i === WORD_COUNT - 1;
  chunkSpecs.push({
    content: `w${i} `,
    finishReason: isLast ? 'stop' : null,
    usage: isLast
      ? { prompt_tokens: 5, completion_tokens: WORD_COUNT, total_tokens: 5 + WORD_COUNT }
      : null,
  });
}

const serializeChunk = ({ content, finishReason, usage }) => {
  const payload = {
    id: 'chatcmpl-spike-0001',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'mock-model',
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { content },
        finish_reason: finishReason,
      },
    ],
  };
  if (usage) payload.usage = usage;
  return `data: ${JSON.stringify(payload)}\n\n`;
};

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }
  req.resume(); // drain the request body

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
  });

  const send = (i) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(serializeChunk(chunkSpecs[i]));
    if (i < chunkSpecs.length - 1) {
      setTimeout(() => send(i + 1), CHUNK_GAP_MS);
    } else {
      res.end('data: [DONE]\n\n');
    }
  };

  setTimeout(() => send(0), FIRST_CHUNK_DELAY_MS);

  // If the client disconnects (e.g. proxy aborted), stop cleanly.
  res.on('close', () => {
    if (!res.writableEnded) res.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`mock-upstream listening on http://${HOST}:${PORT}`);
});
