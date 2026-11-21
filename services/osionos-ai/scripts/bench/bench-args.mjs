// The command line of llm-bench-gpu.mjs: flags over env, so every env knob the
// spike runners set (LLM_URL, LAMBDA, DURATION, MODEL, ...) keeps working.
//
//   --base-url <api root>  e.g. https://host/v1, used as-is (default: LLM_URL + /v1)
//   --model <id>           the model id (default: MODEL, else the first of /v1/models)
//   --n <N>                send exactly N requests; replaces the DURATION window
//   --auth-file <path>     a file holding one "Header: value" line; the key is
//                          read from the file so it never sits in argv
//
// Caveat: with --n and no LAMBDA the requests run one after the other, so the
// percentiles describe an idle server, not a loaded one. A small N (< 20)
// makes p95 the maximum of the runs; the report carries n for that reason.
import { readFileSync } from 'node:fs';

const FLAGS = new Set(['--base-url', '--model', '--n', '--auth-file']);

function flagValues(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		if (!FLAGS.has(argv[index]) || argv[index + 1] === undefined) {
			console.error(`usage: llm-bench-gpu.mjs [--base-url URL] [--model ID] [--n N] [--auth-file PATH]`);
			process.exit(2);
		}
		values[argv[index].slice(2)] = argv[index + 1];
	}
	return values;
}

function authHeaders(file) {
	if (!file) return {};
	const line = readFileSync(file, 'utf8').split('\n')[0];
	const colon = line.indexOf(':');
	return colon < 1 ? {} : { [line.slice(0, colon).trim()]: line.slice(colon + 1).trim() };
}

export function parseArgs(argv, env) {
	const flags = flagValues(argv);
	const llmUrl = (env.LLM_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
	const api = flags['base-url'] ? flags['base-url'].replace(/\/$/, '') : `${llmUrl}/v1`;
	const n = flags.n === undefined ? null : Number(flags.n);
	if (n !== null && !(Number.isInteger(n) && n > 0)) {
		console.error('--n must be a positive integer');
		process.exit(2);
	}
	return {
		api,
		root: api.replace(/\/v1$/, ''),
		model: flags.model || env.MODEL || null,
		n,
		remote: Boolean(flags['base-url']),
		lambdaGiven: env.LAMBDA !== undefined && env.LAMBDA !== '',
		headers: authHeaders(flags['auth-file']),
		warmups: Number(env.WARMUP ?? 2),
	};
}
