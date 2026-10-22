// The fifty pictures of the output check (AI-A1, devil C73): the engine of
// the product, called one time after the other, on the network of ai-dev.
//
// The body is the one of the smoke of the image spike (results/imagegen/
// RESULTS.md): 512x512, response_format b64_json, and the seed inside the
// prompt, in the tag of sd-server (a top-level seed field is ignored).
//
// The pictures stay in the volume: the file of the picture, the id of the
// caption and the digest of the bytes are what the repository keeps.
//
// usage: node nsfw-gen.mjs --set <tsv of id and caption> --out <dir>
//                           --base <http://ai-dev-sd:1234> [--seed 42]

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const options = { seed: 42 };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
	const arg = argv[index];
	if (!arg.startsWith('--')) continue;
	const [key, inline] = arg.replace(/^--/, '').split('=');
	let value = inline;
	if (value === undefined) {
		value = argv[index + 1] ?? 'true';
		index += 1;
	}
	options[key] = value;
}
for (const key of ['set', 'out', 'base', 'manifest']) {
	if (!options[key]) {
		console.error(`missing --${key}`);
		process.exit(2);
	}
}

const rows = readFileSync(options.set, 'utf8')
	.split('\n')
	.filter((line) => line.trim() !== '')
	.map((line) => {
		const [id, caption] = line.split('\t');
		return { id, caption };
	});

const base = options.base.replace(/\/$/, '');
console.log(`base ${base}`);
console.log(`images ${rows.length}`);
console.log(`uptime_s ${(Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0])).toFixed(1)}`);

const names = [];
let failures = 0;
for (const [index, row] of rows.entries()) {
	const seed = Number(options.seed) + index;
	const prompt = `${row.caption} <sd_cpp_extra_args>{"seed": ${seed}}</sd_cpp_extra_args>`;
	const body = {
		model: 'z-image-turbo',
		n: 1,
		prompt,
		size: '512x512',
		response_format: 'b64_json',
	};
	const start = performance.now();
	let answer;
	try {
		const response = await fetch(`${base}/v1/images/generations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(180000),
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
		}
		answer = JSON.parse(text);
	} catch (error) {
		failures += 1;
		console.log(`image ${index + 1} id ${row.id} FAILED ${error.message}`);
		continue;
	}
	const ms = performance.now() - start;
	const picture = answer?.data?.[0]?.b64_json;
	if (!picture) {
		failures += 1;
		console.log(
			`image ${index + 1} id ${row.id} FAILED no b64_json, keys ${Object.keys(answer ?? {}).join(',')}`,
		);
		continue;
	}
	const bytes = Buffer.from(picture, 'base64');
	const name = `${String(index + 1).padStart(2, '0')}.png`;
	writeFileSync(join(options.out, name), bytes);
	const digest = createHash('sha256').update(bytes).digest('hex');
	names.push(`${row.id}\t${name}`);
	console.log(
		`image ${index + 1} id ${row.id} ms ${ms.toFixed(0)} bytes ${bytes.length} sha256 ${digest}`,
	);
}

writeFileSync(options.manifest, `${names.join('\n')}\n`);
console.log(`generated ${names.length}`);
console.log(`failed ${failures}`);
