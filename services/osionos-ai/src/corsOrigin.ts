import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The callers the bridge also answers by name (scripts/bridge-api.mjs requestOriginConfig):
 * a local dev server, the Tauri shell and the desktop app. Anyone else keeps the configured
 * origin, so the browser still refuses them.
 */
const CALLER_ORIGINS = [
	/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/i,
	/^tauri:\/\/localhost$/i,
	/^https?:\/\/tauri\.localhost$/i,
	/^app:\/\/osionos$/i,
];

const isOriginHeader = (name: string): boolean => name.toLowerCase() === 'access-control-allow-origin';

/**
 * Every reply writes the configured origin (http.ts and the routes that write their own
 * headers), so the desktop app (app://osionos) had its AI connections discarded by the
 * browser (2026-10-30). This makes the origin header name the caller when it is one of the
 * above, whichever code writes it.
 */
export function answerWithOrigin(request: IncomingMessage, response: ServerResponse): void {
	const origin = String(request.headers.origin ?? '');
	if (!CALLER_ORIGINS.some((pattern) => pattern.test(origin))) return;
	const setHeader = response.setHeader.bind(response);
	response.setHeader = (name, value) => setHeader(name, isOriginHeader(name) ? origin : value);
	const writeHead = response.writeHead.bind(response) as (...args: unknown[]) => ServerResponse;
	response.writeHead = ((status: number, ...rest: unknown[]) => {
		for (const headers of rest) {
			if (!headers || typeof headers !== 'object' || Array.isArray(headers)) continue;
			const record = headers as Record<string, unknown>;
			for (const name of Object.keys(record)) if (isOriginHeader(name)) record[name] = origin;
		}
		return writeHead(status, ...rest);
	}) as ServerResponse['writeHead'];
}
