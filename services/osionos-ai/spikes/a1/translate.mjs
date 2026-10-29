// The translation of the guard spike (AI-A1).
//
// The guard is measured in French and in Spanish: the prompts of I2P and the
// captions of COCO are translated by the chat model of ai-dev, which is read
// only, and the translations land in the volume: no text of a prompt is in
// the repository.
//
// usage: node translate.mjs <baseURL> <model> <French|Spanish> <in.tsv> <out.tsv>
//
// The base URL is the root of the server (http://ai-dev-llm:8080): the route
// of the completions is added here.
//
// The rows of the input are the id of the row and the text. The output is the
// same, with the translation, and the sha256 of the file is printed.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [baseURL, model, language, input, output] = process.argv.slice(2);
if (!baseURL || !model || !language || !input || !output) {
	console.error('usage: node translate.mjs <baseURL> <model> <French|Spanish> <in.tsv> <out.tsv>');
	process.exit(2);
}

const system = `Translate the user's text into ${language}. Output only the translation.`;

const rows = (await readFile(input, 'utf8'))
	.split('\n')
	.filter((line) => line.length > 0)
	.map((line) => {
		const tab = line.indexOf('\t');
		return [line.slice(0, tab), line.slice(tab + 1)];
	});

const lines = [];
// The model may refuse to translate a prompt: the refusal is a text that the
// guard reads as safe, so the number of refusals is a number of the results.
const refusal = /je ne peux pas|i cannot|no puedo|lo siento|je suis désolé|sorry|as an ai|unable to/i;
let refused = 0;
for (const [index, [id, text]] of rows.entries()) {
	const response = await fetch(`${baseURL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: text }
			],
			temperature: 0,
			max_tokens: 512,
			stream: false
		})
	});
	if (!response.ok) {
		console.error(`call ${index + 1}: the model answered ${response.status}`);
		process.exit(1);
	}
	const payload = await response.json();
	const translation = (payload.choices?.[0]?.message?.content ?? '')
		.trim()
		.replace(/^["'“”]+/, '')
		.replace(/["'“”]+$/, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!translation || refusal.test(translation)) {
		refused += 1;
	}
	lines.push(`${id}\t${translation}`);
	if ((index + 1) % 25 === 0) {
		console.log(`${language} ${index + 1}/${rows.length}`);
	}
}

const body = `${lines.join('\n')}\n`;
await writeFile(output, body, 'utf8');
console.log(
	`${language}: ${lines.length} rows, ${refused} refused, sha256 ${createHash('sha256').update(body).digest('hex')}`
);
