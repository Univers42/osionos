// The SSE reader of the LLM benchmark: yields every JSON object of a stream,
// { done: true } for [DONE] and { error } for an `event: error` block.

export async function* sseObjects(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let index;
			while ((index = buffer.search(/\r?\n\r?\n/)) !== -1) {
				const block = buffer.slice(0, index);
				buffer = buffer.slice(index + (buffer[index] === '\r' ? 4 : 2));
				if (/^event:\s*error\s*$/m.test(block)) { yield { error: block }; continue; }
				for (const line of block.split('\n')) {
					const text = line.trim();
					if (!text.startsWith('data:')) continue;
					const payload = text.slice(5).trim();
					if (payload === '[DONE]') { yield { done: true }; continue; }
					try {
						yield JSON.parse(payload);
					} catch {
						/* keepalive */
					}
				}
			}
		}
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}
