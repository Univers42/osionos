import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../services/osionos-ai/spikes/gpu/embed-bench-gpu.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function benchmark({ active = true } = {}) {
  const files = new Map(active ? [['active', 'ready']] : []);
  let batches = 0;
  const run = new AsyncFunction('process', 'writeFileSync', 'existsSync', 'corpusChunks', 'readGolden', 'fetch', source);
  await run({ env: { EMBED_STYLE: 'openai', QUERIES: '1', PASSAGES: '4', BATCH: '2', CONC: '2', READY_FILE: 'ready', STOP_FILE: 'stop', LLM_ACTIVE_FILE: 'active', OUT: 'report' }, exit: () => {} },
    (path, value) => files.set(path, value), (path) => files.has(path),
    () => [{ chunks: [{ headingPath: 'Synthetic', content: 'passage' }] }],
    () => [{ kind: 'retrieval', q: 'synthetic question' }],
    async (_url, init) => {
      const { input } = JSON.parse(init.body);
      if (input.length > 1) {
        batches += 1;
        if (batches === 6) files.set('stop', 'done');
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { ok: true, json: async () => ({ data: input.map(() => ({ embedding: [1, 0] })) }) };
    });
  return { files, report: JSON.parse(files.get('report')) };
}

it('backfill signals readiness and repeats work until the LLM stop signal', async () => {
  const { files, report } = await benchmark();
  assert.ok(files.has('ready'));
  assert.ok(files.has('stop'));
  assert.ok(report.backfillPassages > report.passages, 'the backfill outlives its initial batch list');
});
it('query measurements fail if the LLM arrival window is no longer active', async () => {
  await assert.rejects(benchmark({ active: false }), /LLM arrival window ended/);
});
