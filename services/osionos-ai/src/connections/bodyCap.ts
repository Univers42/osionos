/**
 * A response body cut the moment it passes a cap (MCP C267, web C345).
 *
 * The MCP transport and the web fetcher both read bodies a stranger writes, so
 * the cap lives here once. A `content-length` above the cap refuses before a
 * byte is read; otherwise every chunk is counted as it streams and the stream
 * errors at the first byte past the cap, so a body is never buffered whole.
 *
 * The bytes counted are the bytes undici hands over, and undici decodes gzip
 * and br before `response.body`: the count is of DECODED bytes, so a
 * compression bomb is cut at the cap (tests/bodyCap.test.ts proves both). The
 * rewrapped response drops `content-length` and `content-encoding`, which
 * described the wire, not this stream.
 *
 * Caveat: the `content-length` pre-check sees the size on the wire; a small
 * compressed body that decodes past the cap passes it and is cut by the count.
 */
export function capBody(response: Response, max: number, onExceeded: () => void): Response {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > max) {
		onExceeded();
		void response.body?.cancel();
		throw new Error('too_large');
	}
	if (!response.body) return response;
	let total = 0;
	const counted = response.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				total += chunk.byteLength;
				if (total > max) {
					onExceeded();
					controller.error(new Error('too_large'));
					return;
				}
				controller.enqueue(chunk);
			},
		}),
	);
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	headers.delete('content-encoding');
	return new Response(counted, { status: response.status, statusText: response.statusText, headers });
}
