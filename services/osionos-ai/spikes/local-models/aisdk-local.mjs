// P0a adapter (AI SDK `streamText` + `@ai-sdk/openai-compatible`) against the
// local llama.cpp runtime on ai-dev-net. Proves our planned adapter talks to a
// local OpenAI-compatible endpoint with no API key.
//
// Run inside a node:22 container on ai-dev-net, with the P0a node_modules
// mounted at /app/node_modules so `ai` and `@ai-sdk/openai-compatible` resolve.
import { streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const BASE = (process.env.LLM_URL || 'http://ai-dev-llm:8080').replace(/\/$/, '');

const modelsRes = await fetch(`${BASE}/v1/models`);
if (!modelsRes.ok) {
  console.error(`llama.cpp not ready: GET /v1/models -> ${modelsRes.status}`);
  process.exit(1);
}
const models = await modelsRes.json();
const modelId = models.data?.[0]?.id;
console.log(`AI-SDK target: ${BASE}/v1  model=${modelId}`);

const provider = createOpenAICompatible({
  name: 'local-llama',
  baseURL: `${BASE}/v1`,
  // llama.cpp's server does not authenticate; the SDK requires the field to be present.
  apiKey: 'local-noauth',
});

const t0 = performance.now();
const result = streamText({
  model: provider(modelId),
  prompt: 'In one short sentence, say what an embedding model is used for.',
});

let text = '';
const partTypes = new Set();
for await (const part of result.fullStream) {
  partTypes.add(part.type);
  if (part.type === 'text-delta') {
    text += part.text ?? part.delta ?? part.textDelta ?? '';
  } else if (part.type === 'error') {
    console.error('stream error:', part.error ?? part);
    process.exit(1);
  }
}
const elapsed = performance.now() - t0;
const usage = await result.usage;

console.log('--- AI-SDK STREAM TEXT ---');
console.log(text);
console.log('--- END ---');
console.log(`elapsed: ${elapsed.toFixed(0)} ms`);
console.log(`usage: ${JSON.stringify(usage)}`);
console.log(`stream part types: ${[...partTypes].join(', ')}`);
