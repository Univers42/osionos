// The shim of the embedding service (AI-P0d, Part B).
//
// The golden-set runner of the service talks to TEI: POST /embed with
// {inputs: [...], truncate: true}, and an answer that is a bare array of
// vectors. llama.cpp talks the OpenAI shape: POST /v1/embeddings with
// {input: [...]}, and an answer that is {data: [{embedding}]}.
//
// This shim is the TEI shape on top of the llama.cpp one, so the real
// retrieval of the service (src/retrieval/search.ts) and the real golden-set
// runner (eval/run.ts) can be pointed at the GPU embedder WITHOUT a change of
// the production code: only the URL of the service changes.
//
//   node tei-shim.mjs
//
// Env:
//   LLAMA_URL   the llama.cpp server (default http://127.0.0.1:18090)
//   PORT        the port of the shim (default 18091)
//   LOG         a file to log the calls to (default: nothing)

import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const LLAMA = (process.env.LLAMA_URL || 'http://127.0.0.1:18090').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 18091);
const LOG = process.env.LOG || '';

let calls = 0;
let inputs = 0;

function log(line) {
	if (!LOG) return;
	try {
		appendFileSync(LOG, `${line}\n`);
	} catch {
		/* the log is a convenience, never a reason to stop */
	}
}

/** The embeddings of the inputs, from the llama.cpp server. */
async function embeddings(of) {
	const res = await fetch(`${LLAMA}/v1/embeddings`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ input: of }),
	});
	if (!res.ok) throw new Error(`llama.cpp -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const json = await res.json();
	const data = Array.isArray(json.data) ? json.data : [];
	const sorted = [...data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
	return sorted.map((row) => row.embedding);
}

const server = createServer((request, response) => {
	const reply = (code, body) => {
		const text = JSON.stringify(body);
		response.writeHead(code, { 'content-type': 'application/json' });
		response.end(text);
	};
	if (request.method === 'GET' && request.url.startsWith('/health')) {
		reply(200, { status: 'ok' });
		return;
	}
	if (request.method === 'GET' && request.url.startsWith('/info')) {
		reply(200, { model_id: 'llama.cpp', model_type: { embedding: { pooling: 'mean' } } });
		return;
	}
	let body = '';
	request.on('data', (chunk) => {
		body += chunk;
	});
	request.on('end', async () => {
		try {
			const parsed = body ? JSON.parse(body) : {};
			if (request.url.startsWith('/embed')) {
				const of = Array.isArray(parsed.inputs) ? parsed.inputs : [parsed.inputs];
				calls += 1;
				inputs += of.length;
				const vectors = await embeddings(of);
				log(`embed ${of.length} inputs -> ${vectors.length} vectors`);
				reply(200, vectors);
				return;
			}
			if (request.url.startsWith('/tokenize')) {
				const res = await fetch(`${LLAMA}/tokenize`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ content: parsed.inputs }),
				});
				const json = await res.json();
				reply(200, { token_ids: json.tokens ?? json.token_ids ?? [] });
				return;
			}
			reply(404, { error: 'not found' });
		} catch (error) {
			reply(500, { error: String(error.message ?? error) });
		}
	});
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[shim] the TEI shape of ${LLAMA} is on the port ${PORT}`);
});

process.on('SIGTERM', () => {
	console.log(`[shim] ${calls} calls, ${inputs} inputs`);
	process.exit(0);
});
