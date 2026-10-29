// The agreement of the two embedders (AI-P0d, Part B).
//
// For every chunk of the corpus and every question of the golden set: the
// vector of TEI (the CPU one) and the vector of llama.cpp (the GPU one), and
// the cosine between them. The mean and the minimum are the numbers of the
// report: the closer to 1, the more the GPU embedder is the same embedder.
//
//   node embed-agree.mjs
//
// Env:
//   TEI_URL     the TEI service (default http://127.0.0.1:4911)
//   LLAMA_URL   the llama.cpp service (default http://127.0.0.1:18090)
//   OUT         a file to write the JSON to

import { writeFileSync } from 'node:fs';
import { corpusChunks } from './requests.mjs';
import { readGolden } from '../../eval/lib.mjs';

const TEI = (process.env.TEI_URL || 'http://127.0.0.1:4911').replace(/\/$/, '');
const LLAMA = (process.env.LLAMA_URL || 'http://127.0.0.1:18090').replace(/\/$/, '');
const BATCH = Number(process.env.BATCH || 32);

async function embedTei(inputs) {
	const res = await fetch(`${TEI}/embed`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ inputs, truncate: true }),
	});
	if (!res.ok) throw new Error(`TEI -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const json = await res.json();
	return Array.isArray(json) ? json : json.embeddings;
}

async function embedLlama(inputs) {
	const res = await fetch(`${LLAMA}/v1/embeddings`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ input: inputs }),
	});
	if (!res.ok) throw new Error(`llama.cpp -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const json = await res.json();
	return json.data.sort((left, right) => (left.index ?? 0) - (right.index ?? 0)).map((row) => row.embedding);
}

function cosine(left, right) {
	let dot = 0;
	let normLeft = 0;
	let normRight = 0;
	for (let index = 0; index < left.length; index += 1) {
		dot += left[index] * right[index];
		normLeft += left[index] * left[index];
		normRight += right[index] * right[index];
	}
	return dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
}

// ---------------------------------------------------------------- the data
const chunks = corpusChunks();
const passages = [];
for (const page of chunks) {
	for (const chunk of page.chunks) passages.push(`passage: ${chunk.headingPath}\n${chunk.content}`);
}
const questions = readGolden()
	.filter((question) => question.kind !== 'acl')
	.map((question) => `query: ${question.q}`);
console.log(`${passages.length} chunks and ${questions.length} questions`);

async function compare(inputs, label) {
	const teiVectors = [];
	const llamaVectors = [];
	for (let index = 0; index < inputs.length; index += BATCH) {
		const batch = inputs.slice(index, index + BATCH);
		teiVectors.push(...(await embedTei(batch)));
		llamaVectors.push(...(await embedLlama(batch)));
	}
	const cosines = teiVectors.map((vector, index) => cosine(vector, llamaVectors[index]));
	const sorted = [...cosines].sort((a, b) => a - b);
	const mean = cosines.reduce((a, b) => a + b, 0) / cosines.length;
	const worst = sorted[0];
	const worstAt = cosines.indexOf(worst);
	console.log(
		`${label}: n=${cosines.length}  mean=${mean.toFixed(6)}  min=${worst.toFixed(6)}  ` +
			`p05=${sorted[Math.floor(sorted.length * 0.05)].toFixed(6)}  dim=${teiVectors[0].length}/${llamaVectors[0].length}`,
	);
	console.log(`  the worst one: ${JSON.stringify(inputs[worstAt]).slice(0, 160)}`);
	return { label, n: cosines.length, mean, min: worst, p05: sorted[Math.floor(sorted.length * 0.05)], dim: teiVectors[0].length };
}

const passagesAgreement = await compare(passages, 'the chunks of the corpus');
const questionsAgreement = await compare(questions, 'the questions of the golden set');

const report = { tei: TEI, llama: LLAMA, passages: passagesAgreement, questions: questionsAgreement };
const text = JSON.stringify(report, null, 2);
if (process.env.OUT) writeFileSync(process.env.OUT, `${text}\n`);
console.log(text);
process.exit(0);
