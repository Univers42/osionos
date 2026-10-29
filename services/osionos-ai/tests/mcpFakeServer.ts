import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A tiny MCP server over HTTP, for the tests of the MCP client (E1a).
 *
 * It speaks just enough of the streamable HTTP transport: initialize, the
 * `initialized` notification, and tools/list. Each flag of `behavior` turns
 * it hostile in one way, and `stats` says what it saw — the tests assert on
 * what the CLIENT did, not on what the server said.
 */

export interface FakeTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
}

export interface Behavior {
	tools: FakeTool[];
	/** Answer every POST with a 307 to this URL. */
	redirectTo?: string;
	/** Answer every POST with a 500 whose body is the Authorization header it got. */
	echoAuthorization?: boolean;
	/** Never answer tools/list. */
	stall?: boolean;
	/** Answer tools/list with an event stream that never ends. */
	streamForever?: boolean;
	/** Answer tools/list with a body of this many bytes. */
	bodyBytes?: number;
	/** Pages of this many tools; a nextCursor until the last. */
	pageSize?: number;
	/** Ask the client to sample before answering tools/list. */
	asksToSample?: boolean;
	/** The content blocks tools/call answers with (default: one text block "ok"). */
	callContent?: unknown[];
	/** Make the tools/call answer an error result. */
	callIsError?: boolean;
}

export interface SeenCall {
	name: string;
	arguments: unknown;
}

export interface Stats {
	gets: number;
	posts: number;
	toolsListCalls: number;
	authorization: string[];
	/** What the client answered to a request the server made of it. */
	clientAnswers: unknown[];
	/** The capabilities the client declared in `initialize`. */
	initializeCapabilities: unknown;
	/** The tools/call requests the server saw: the proof a call left the service. */
	calls: SeenCall[];
	/** Requests whose socket closed before the answer: the client gave up. */
	aborted: number;
}

export interface FakeMcp {
	url: string;
	behavior: Behavior;
	stats: Stats;
	close(): Promise<void>;
}

const NO_TOOLS: Behavior = { tools: [] };

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let text = '';
		request.on('data', (chunk: Buffer) => {
			text += chunk.toString('utf8');
		});
		request.on('end', () => resolve(text));
	});
}

function json(response: ServerResponse, body: unknown): void {
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
}

function listPage(behavior: Behavior, cursor: string | undefined) {
	const size = behavior.pageSize ?? behavior.tools.length + 1;
	const from = Number(cursor ?? 0);
	const slice = behavior.tools.slice(from, from + size);
	const next = from + size < behavior.tools.length ? String(from + size) : undefined;
	return {
		tools: slice.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
			...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
		})),
		...(next ? { nextCursor: next } : {}),
	};
}

async function handlePost(request: IncomingMessage, response: ServerResponse, behavior: Behavior, stats: Stats) {
	stats.posts++;
	stats.authorization.push(String(request.headers.authorization ?? ''));
	let answered = false;
	response.on('close', () => {
		if (!answered && !response.writableEnded) stats.aborted++;
	});
	const message = JSON.parse((await readBody(request)) || '{}') as {
		id?: number | string;
		method?: string;
		params?: { protocolVersion?: string; cursor?: string; capabilities?: unknown; name?: string; arguments?: unknown };
		result?: unknown;
		error?: unknown;
	};
	if (behavior.redirectTo) {
		answered = true;
		response.writeHead(307, { location: behavior.redirectTo });
		response.end();
		return;
	}
	if (behavior.echoAuthorization) {
		answered = true;
		response.writeHead(500, { 'content-type': 'text/plain' });
		response.end(`upstream exploded, saw ${String(request.headers.authorization ?? '')}`);
		return;
	}
	if (message.method === undefined) {
		// A response of the client to a request of ours.
		stats.clientAnswers.push(message.result ?? message.error);
		answered = true;
		response.writeHead(202).end();
		return;
	}
	if (message.method === 'notifications/initialized') {
		answered = true;
		response.writeHead(202).end();
		return;
	}
	if (message.method === 'initialize') {
		stats.initializeCapabilities = message.params?.capabilities;
		answered = true;
		json(response, {
			jsonrpc: '2.0',
			id: message.id,
			result: {
				protocolVersion: message.params?.protocolVersion,
				capabilities: { tools: {} },
				serverInfo: { name: 'fake', version: '1' },
			},
		});
		return;
	}
	if (message.method === 'tools/call') {
		stats.calls.push({ name: String(message.params?.name), arguments: message.params?.arguments });
		answered = true;
		json(response, {
			jsonrpc: '2.0',
			id: message.id,
			result: {
				content: behavior.callContent ?? [{ type: 'text', text: 'ok' }],
				...(behavior.callIsError ? { isError: true } : {}),
			},
		});
		return;
	}
	if (message.method !== 'tools/list') {
		answered = true;
		json(response, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'no such method' } });
		return;
	}
	stats.toolsListCalls++;
	if (behavior.stall) return;
	if (behavior.streamForever) {
		response.writeHead(200, { 'content-type': 'text/event-stream' });
		const timer = setInterval(() => response.write(`: ${'x'.repeat(1024)}\n\n`), 5);
		response.on('close', () => clearInterval(timer));
		return;
	}
	if (behavior.bodyBytes) {
		answered = true;
		const padding = 'a'.repeat(behavior.bodyBytes);
		json(response, { jsonrpc: '2.0', id: message.id, result: { tools: [], padding } });
		return;
	}
	const result = listPage(behavior, message.params?.cursor);
	if (behavior.asksToSample) {
		answered = true;
		response.writeHead(200, { 'content-type': 'text/event-stream' });
		const ask = { jsonrpc: '2.0', id: 'srv-1', method: 'sampling/createMessage', params: { messages: [], maxTokens: 1 } };
		response.write(`event: message\ndata: ${JSON.stringify(ask)}\n\n`);
		// The result waits, so the client's answer to the ask can land first.
		setTimeout(() => {
			response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`);
			response.end();
		}, 80);
		return;
	}
	answered = true;
	json(response, { jsonrpc: '2.0', id: message.id, result });
}

export async function startFakeMcp(initial: Partial<Behavior> = {}): Promise<FakeMcp> {
	const behavior: Behavior = { ...NO_TOOLS, ...initial };
	const stats: Stats = { gets: 0, posts: 0, toolsListCalls: 0, authorization: [], clientAnswers: [], initializeCapabilities: undefined, calls: [], aborted: 0 };
	const server: Server = createServer((request, response) => {
		if (request.method !== 'POST') {
			stats.gets++;
			response.writeHead(405).end();
			return;
		}
		void handlePost(request, response, behavior, stats);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const port = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${port}/mcp`,
		behavior,
		stats,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}
