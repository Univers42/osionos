// ONE real call through the same adapter to opencode Zen. Synthetic prompt
// only (Zen logs prompts; never send repo content). If the first model errors,
// try the fallback model. If anonymous access is refused, the exact status/body
// is recorded as a finding.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const MODEL_IDS = ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free'];
const PROMPT = 'What is the weather in Paris? Use the tool.';

async function runOnce(modelId) {
  const provider = createOpenAICompatible({
    name: 'zen',
    baseURL: 'https://opencode.ai/zen/v1',
    // deliberately no apiKey: anonymous access
  });

  const result = streamText({
    model: provider(modelId),
    prompt: PROMPT,
    tools: {
      get_weather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ({ tempC: 18 }),
      }),
    },
    stopWhen: stepCountIs(2),
  });

  const partTypes = new Set();
  let toolCallParis = null;
  for await (const part of result.fullStream) {
    partTypes.add(part.type);
    if (part.type === 'error') {
      const e = part.error ?? part;
      throw e;
    }
    if (part.type === 'tool-call') {
      const input = part.input ?? part.args;
      if (input && input.city === 'Paris') {
        toolCallParis = { toolName: part.toolName, input };
      }
    }
  }
  const text = await result.text;
  return { partTypes: [...partTypes], toolCallParis, text };
}

for (const modelId of MODEL_IDS) {
  console.log(`--- trying model: ${modelId} ---`);
  try {
    const out = await runOnce(modelId);
    console.log(`model: ${modelId}`);
    console.log(`distinct stream part types: ${JSON.stringify(out.partTypes)}`);
    console.log(
      `tool call with parsed input {city:"Paris"} arrived: ${
        out.toolCallParis ? JSON.stringify(out.toolCallParis) : 'NO'
      }`,
    );
    console.log(`final text: ${JSON.stringify(out.text)}`);
    process.exit(0);
  } catch (err) {
    const e = err ?? {};
    console.log(`MODEL ${modelId} errored:`);
    console.log(`  name: ${e.name}`);
    console.log(`  message: ${e.message}`);
    console.log(`  url: ${e.url}`);
    console.log(`  statusCode: ${e.statusCode}`);
    console.log(`  responseBody: ${e.responseBody}`);
    if (!e.statusCode) console.log(`  stack: ${e.stack}`);
  }
}
console.log('SMOKE RESULT: all candidate models failed (details above)');
process.exit(1);
