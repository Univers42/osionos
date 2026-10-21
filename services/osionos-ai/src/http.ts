import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType } from 'zod';
import { config } from './config.ts';

/**
 * The bridge's CORS headers (scripts/bridge-api.mjs:2208-2216), plus last-event-id
 * for the event stream of a later brief.
 */
const CORS_HEADERS: Record<string, string> = {
	'access-control-allow-origin': config.allowedOrigin,
	'access-control-allow-credentials': 'true',
	'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'access-control-allow-headers':
		'content-type, authorization, x-prismatica-bridge-timestamp, x-prismatica-bridge-signature, last-event-id',
	vary: 'Origin',
};

/** An error that carries the status and the code the client gets. */
export function httpError(status: number, code: string): Error {
	return Object.assign(new Error(code), { status, code });
}

/** A JSON answer with the CORS headers. */
export function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		...CORS_HEADERS,
	});
	response.end(JSON.stringify(body));
}

/** A JSON refusal: the status and a code, never the internals. */
export function sendError(response: ServerResponse, status: number, code: string): void {
	sendJson(response, status, { ok: false, code });
}

/** The preflight answer: 204 and the CORS headers. */
export function sendPreflight(response: ServerResponse): void {
	response.writeHead(204, CORS_HEADERS);
	response.end();
}

/**
 * The body of a request, parsed and validated.
 * Over the cap is a 413, invalid JSON or an invalid body is a 400.
 */
export async function readJson<T>(request: IncomingMessage, schema: ZodType<T>, maxBytes = 65_536): Promise<T> {
	const declared = Number(request.headers['content-length'] ?? 0);
	if (Number.isFinite(declared) && declared > maxBytes) throw httpError(413, 'payload_too_large');
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk as Buffer);
		size += buffer.length;
		if (size > maxBytes) throw httpError(413, 'payload_too_large');
		chunks.push(buffer);
	}
	const raw = Buffer.concat(chunks).toString('utf8');
	if (!raw.trim()) throw httpError(400, 'invalid_json');
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw httpError(400, 'invalid_json');
	}
	const result = schema.safeParse(parsed);
	if (!result.success) throw httpError(400, 'invalid_request');
	return result.data;
}

/**
 * The headers of an event stream: the framing of the wire contract, plus the
 * CORS headers of the service.
 */
export function sendSseHeaders(response: ServerResponse): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		'x-accel-buffering': 'no',
		...CORS_HEADERS,
	});
}

/** One event of a stream: the id of the frame, its type, its data. */
export function writeSseFrame(
	response: ServerResponse,
	{ id, type, data }: { id: string; type: string; data: unknown },
): void {
	if (response.writableEnded || response.destroyed) return;
	response.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** The comment that keeps a quiet stream alive. */
export function writeSsePing(response: ServerResponse): void {
	if (response.writableEnded || response.destroyed) return;
	response.write(': ping\n\n');
}
