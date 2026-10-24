// The wire proof of the local image path (devil C71): the AI SDK's
// openai-compatible imageModel() against stable-diffusion.cpp's sd-server, the
// exact adapter the service would use. Run inside the osionos-ai image so the
// SDK versions are the service's own.
//
// usage: node imagegen-wire.mjs <baseURL> <count>
// Prints, per call: the request body keys, the response shape, the PNG magic
// check, the decoded size from the IHDR, and the wall time.

import { generateImage } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const [baseURL, countArg] = process.argv.slice(2);
const count = Number(countArg ?? 1);
const prompts = [
	'a red fox reading a newspaper in the snow, morning light',
	'a watercolor of a mountain lake with pine trees and a wooden cabin',
	'a bowl of fresh strawberries and blueberries on a linen cloth',
];

const seen = [];
/** Records what goes over the wire, without the prompt text. */
async function recordingFetch(url, init) {
	const body = JSON.parse(init.body);
	seen.push({ url: String(url), keys: Object.keys(body).sort(), n: body.n, size: body.size });
	return fetch(url, init);
}

const provider = createOpenAICompatible({ name: 'sdcpp', baseURL, fetch: recordingFetch });

for (let i = 0; i < count; i += 1) {
	const start = performance.now();
	const result = await generateImage({
		model: provider.imageModel('z-image-turbo'),
		prompt: prompts[i % prompts.length],
		size: '512x512',
		n: 1,
	});
	const ms = Math.round(performance.now() - start);
	const bytes = result.images[0].uint8Array;
	const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	const size = png ? `${view.getUint32(16)}x${view.getUint32(20)}` : 'n/a';
	console.log(JSON.stringify({
		call: i + 1,
		wall_ms: ms,
		request: seen[i],
		images: result.images.length,
		bytes: bytes.length,
		png,
		decoded: size,
		mediaType: result.images[0].mediaType,
		usage: result.usage ?? null,
		warnings: result.warnings,
	}));
}
