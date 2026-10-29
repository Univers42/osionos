import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gpu-shell-'));
  const spike = join(dir, 'service/spikes/gpu');
  cpSync(new URL('../../services/osionos-ai/spikes/gpu/', import.meta.url), spike, { recursive: true, filter: (path) => !path.includes('/results') });
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const log = join(dir, 'calls.jsonl'); writeFileSync(log, '');
  const mock = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const log = (kind, data = {}) => fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({kind, ...data}) + '\\n');
const delay = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
if (name === 'date') { const f = process.env.MOCK_LOG + '.time'; const n = Number(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 0) + Number(process.env.MOCK_CLOCK_STEP || 1); fs.writeFileSync(f, String(n)); console.log(n); return; }
if (name === 'sleep') { await delay(25); return; }
if (name === 'cat') { if (args.some(a => a.includes('/sys/class/drm/'))) console.log(process.env.MOCK_VRAM || '1'); else process.exit(require('node:child_process').spawnSync('/bin/cat', args, {stdio: 'inherit'}).status); return; }
if (name === 'cut') { if (args.includes('/proc/loadavg')) console.log('7'); else process.exit(require('node:child_process').spawnSync('/usr/bin/cut', args, {stdio: 'inherit'}).status); return; }
if (name === 'curl') { console.log('{"id":"mock"}'); return; }
if (name === 'pgrep' || name === 'ss') return;
if (args[0] === 'ps') return;
if (args[0] === 'inspect') { console.log(args.includes('{{json .Config.Cmd}}') ? '[\"/models/multilingual-e5-small-official-f16.gguf\"]' : process.env.MOCK_RUNNING || 'false'); return; }
if (args[0] === 'rm' || args[0] === 'logs') return;
if (args.includes('-d')) { log('server', {args}); if (process.env.MOCK_FAIL_SERVER) process.exit(13); return; }
if (args.includes('python3')) { log('convert'); process.exit(23); }
if (args.includes('alpine:3.20')) { log(args.some(a => a.includes('rm -f')) ? 'remove-output' : 'list-output'); return; }
const env = {};
for (let i = 0; i < args.length; i++) if (args[i] === '-e') { const [k, ...v] = args[++i].split('='); env[k] = v.join('='); }
let out = '';
for (let i = 0; i < args.length; i++) if (args[i] === '-v' && args[i+1].endsWith(':/out')) out = args[i+1].slice(0, -5);
const map = p => path.join(out, p.slice('/out/'.length));
const script = args.find(a => a.endsWith('.mjs')) || '';
log('client', {script, env});
if (script.includes('summarize')) { log('summary'); return; }
if (process.env.MOCK_FAIL && script.includes(process.env.MOCK_FAIL)) process.exit(27);
if (env.READY_FILE) { fs.writeFileSync(map(env.READY_FILE), 'ready'); log('ready', {label: env.LABEL || 'backfill'}); }
if (env.STOP_FILE) {
  while (!fs.existsSync(map(env.STOP_FILE))) await delay(10);
} else if (env.LABEL) {
  await delay(500);
}
if (env.OUT) fs.writeFileSync(map(env.OUT), '{}');
log('finished', {label: env.LABEL || env.OUT || script});
})();
`;
  for (const name of ['docker', 'date', 'sleep', 'cat', 'cut', 'curl', 'pgrep', 'ss']) writeFileSync(join(bin, name), mock, { mode: 0o755 });
  // Log sampler start and termination; the test has no GPU driver.
  writeFileSync(join(spike, 'gpu-sampler.sh'), `#!/bin/sh\ntrap 'echo "{\\"kind\\":\\"sampler-stop\\"}" >> "$MOCK_LOG"; exit 0' TERM\necho '{"kind":"sampler-start"}' >> "$MOCK_LOG"\n: > "$1"\nwhile :; do /bin/sleep 0.02; done\n`);
  const out = join(dir, 'out'); mkdirSync(out);
  return {
    out,
    run(script, args = [], env = {}) {
      const result = spawnSync('sh', [join(spike, script), ...args], { encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OUT_DIR: out, MOCK_LOG: log, DURATION: '1', LAMBDAS: '1', CPU_WAIT: '0', MOCK_CLOCK_STEP: script === 'run-part-a.sh' ? '1000' : '1', ...env } });
      return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
    },
    close() { rmSync(dir, { recursive: true, force: true }); },
  };
}

it('conversion removes the old GGUF and fails before listing a failed conversion', () => {
  const f = fixture();
  try {
    const result = f.run('convert-e5.sh');
    assert.equal(result.status, 23, result.stderr);
    const kinds = result.calls.map(c => c.kind);
    assert.ok(kinds.indexOf('remove-output') < kinds.indexOf('convert'));
    assert.ok(!kinds.includes('list-output'));
  } finally { f.close(); }
});
it('Part A continues after the high CPU deadline and propagates benchmark and server failures', () => {
  for (const env of [{}, { MOCK_FAIL: 'llm-bench' }, { MOCK_FAIL_SERVER: '1' }]) {
    const f = fixture();
    try {
      const result = f.run('run-part-a.sh', ['1-cpu-np4'], env);
      assert.equal(result.status, env.MOCK_FAIL ? 27 : env.MOCK_FAIL_SERVER ? 13 : 0, result.stderr);
      if (!env.MOCK_FAIL_SERVER) assert.match(result.stderr, /load average stayed at 7/);
      assert.equal(result.calls.some(c => c.kind === 'summary'), !env.MOCK_FAIL && !env.MOCK_FAIL_SERVER);
    } finally { f.close(); }
  }
});
it('Part A keeps the capacity skip successful', () => {
  const f = fixture();
  try {
    const result = f.run('run-part-a.sh', ['1-cpu-np4'], { MOCK_VRAM: '9000000000' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.calls.some(c => c.kind === 'summary'));
  } finally { f.close(); }
});
for (const [step, failure, output] of [['tei', 'tei-bench', 'tei-bench-p0c.txt'], ['tei', 'embed-bench', 'tei-embed-bench.json'], ['gpu', 'embed-bench', 'llama-embed-bench-b32.json'], ['agree', 'embed-agree', 'embed-agree-official.json']]) {
  it(`Part B ${step}/${failure} propagates failure and cannot summarize a stale output`, () => {
    const f = fixture();
    try {
      writeFileSync(join(f.out, output), 'stale');
      const result = f.run('run-part-b.sh', [step], { MOCK_FAIL: failure });
      assert.equal(result.status, 27, result.stderr);
      assert.ok(!result.calls.some(c => c.kind === 'summary'));
      if (output.endsWith('.json')) assert.equal(existsSync(join(f.out, output)), false);
      else assert.notEqual(readFileSync(join(f.out, output), 'utf8'), 'stale');
    } finally { f.close(); }
  });
}
for (const running of ['true', 'false']) {
  it(`agreement reaches both services when running=${running}`, () => {
    const f = fixture();
    try {
      const result = f.run('run-part-b.sh', ['agree'], { MOCK_RUNNING: running });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.calls.filter(c => c.kind === 'summary').length, 3);
      assert.equal(result.calls.filter(c => c.kind === 'server').length, running === 'true' ? 2 : 4);
    } finally { f.close(); }
  });
}
it('Part C samples all workloads, overlaps clients, and stops backfill after the LLM', () => {
  const f = fixture();
  try {
    const result = f.run('run-part-c.sh');
    assert.equal(result.status, 0, result.stderr);
    const calls = result.calls;
    const position = (predicate) => calls.findIndex(predicate);
    assert.ok(position(c => c.kind === 'sampler-start') < position(c => c.kind === 'client'));
    assert.ok(position(c => c.kind === 'ready' && c.label === 'part-c-llm-only') < position(c => c.kind === 'client' && c.env.OUT?.includes('query-under-llm')));
    assert.ok(position(c => c.kind === 'client' && c.env.OUT?.includes('query-under-llm')) < position(c => c.kind === 'finished' && c.label === 'part-c-llm-only'));
    assert.ok(position(c => c.kind === 'ready' && c.label === 'backfill') < position(c => c.kind === 'client' && c.env.LABEL === 'part-c-llm-under-backfill'));
    assert.equal(calls.find(c => c.env?.STOP_FILE).env.PASSAGES, '25000');
    assert.ok(position(c => c.kind === 'finished' && c.label === 'part-c-llm-under-backfill') < position(c => c.kind === 'finished' && c.label?.includes('part-c-backfill.json')));
    assert.ok(position(c => c.kind === 'finished' && c.label?.includes('part-c-backfill.json')) < position(c => c.kind === 'sampler-stop'));
    assert.ok(position(c => c.kind === 'sampler-stop') < position(c => c.kind === 'summary'));
  } finally { f.close(); }
});
