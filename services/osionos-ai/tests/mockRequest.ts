import type { IncomingMessage } from 'node:http';

/**
 * The request, as the mocks read it.
 *
 * The mocks are servers: they read a body, and they look at the turns of the
 * conversation. Both live here, so the mocks themselves stay about what they
 * answer.
 */

/** The body of a request, read to the end. */
export function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', () => resolve(''));
	});
}

/**
 * The text of the last turn of the user in a request.
 *
 * The content of a turn is a string or a list of parts: the mock reads both.
 */
export function lastUserText(body: unknown): string {
	const messages = (body as { messages?: unknown } | null)?.messages;
	if (!Array.isArray(messages)) return '';
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as { role?: unknown; content?: unknown } | null;
		if (message?.role !== 'user') continue;
		if (typeof message.content === 'string') return message.content;
		if (!Array.isArray(message.content)) return '';
		return message.content
			.map((part) => {
				const candidate = part as { text?: unknown } | null;
				return typeof candidate?.text === 'string' ? candidate.text : '';
			})
			.join(' ');
	}
	return '';
}
