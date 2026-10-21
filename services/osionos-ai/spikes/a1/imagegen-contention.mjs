// C75: the chat model's time to first token while a local image renders. ai-dev's
// chat model is llama.cpp on the CPU, and the image text encoder runs on the CPU
// too (--backend te=cpu), so the two meet on the CPU, not only on the GPU.
//
// usage: node imagegen-contention.mjs <chat base URL> <image base URL> <rounds>
// Prints idle TTFTs, then TTFTs measured while one image call is in flight.

const [chatBase, imageBase, roundsArg] = process.argv.slice(2);
const rounds = Number(roundsArg ?? 3);
// A different first word per call: llama.cpp's prefix cache would otherwise
// answer a repeated question without its prefill (4211 ms, then 59 ms).
const TOPICS = ['knowledge base', 'wiki', 'kanban board', 'database index', 'changelog', 'style guide', 'roadmap', 'retrospective'];
let asked = 0;

async function ttftMs() {
	const start = performance.now();
	const response = await fetch(`${chatBase}/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'qwen3-4b', stream: true, max_tokens: 24, messages: [{ role: 'user', content: `${TOPICS[asked++ % TOPICS.length]}: in one sentence, what is it?` }] }),
	});
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let first = null;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		if (first === null && /"content":"[^"]/.test(decoder.decode(value))) first = performance.now() - start;
	}
	return Math.round(first ?? -1);
}

const idle = [];
for (let i = 0; i < rounds; i += 1) idle.push(await ttftMs());
console.log(JSON.stringify({ phase: 'idle', ttft_ms: idle }));

const busy = [];
for (let i = 0; i < rounds; i += 1) {
	const imageStart = performance.now();
	const image = fetch(`${imageBase}/images/generations`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'z', prompt: `a lighthouse on a cliff at dusk<sd_cpp_extra_args>{"seed": ${100 + i}}</sd_cpp_extra_args>`, n: 1, size: '512x512' }),
	}).then((r) => r.text());
	await new Promise((resolve) => setTimeout(resolve, 500));
	busy.push(await ttftMs());
	await image;
	console.log(JSON.stringify({ phase: 'during-image', round: i + 1, ttft_ms: busy[i], image_ms: Math.round(performance.now() - imageStart) }));
}
