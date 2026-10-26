import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { checkEndpointUrl, guardedFetch } from '../connections/endpointGuard.ts';
import type { GuardedFetch } from '../connections/endpointGuard.ts';

/**
 * The transport to a remote MCP server the user registered (E1a).
 *
 * It lists the tools of one server and nothing else: no tool is called here,
 * and no run reaches this file. What it holds to, and the condition each line
 * answers:
 *   - EVERY byte goes through the guarded fetch (C263): the SDK is handed our
 *     fetch for the POSTs and the GETs alike, so the global fetch is never
 *     called, a redirect is never followed, and a name that resolves to a
 *     private address is refused at connect time.
 *   - EVERY GET is answered 405 here, before the network (C267): the SDK opens
 *     its server-to-client stream with a GET and treats 405 as "this server has
 *     none". No stream, so nothing can push to us.
 *   - ONE deadline covers the connect, the pages and the bodies (C267), and a
 *     body above the cap is cut as it streams, not after it is buffered.
 *   - The client is closed in `finally` (C267), whatever happened.
 *   - The client declares no capability and no handler (C279): a server that
 *     asks us to sample, list roots or elicit gets "method not found".
 *   - What the caller sees is one of four fixed codes (C275). The raw error of
 *     the SDK carries the body of the server, and a server may echo the
 *     header we sent: `toFailure` is the one place that raw error is dropped.
 *
 * Caveat: the cap counts the bytes of one response, not of the whole session:
 * five pages of 1 MiB are 5 MiB. The deadline bounds that sum in time, not in
 * size.
 */

export type McpFailureCode = 'mcp_unreachable' | 'mcp_timeout' | 'mcp_too_large' | 'mcp_protocol';

/** A failure of the transport: only the code, never the words of the server. */
export class McpFailure extends Error {
	readonly code: McpFailureCode;
	constructor(code: McpFailureCode) {
		super(code);
		this.name = 'mcp_failure';
		this.code = code;
	}
}

export const TOTAL_DEADLINE_MS = 20_000;
export const MAX_BODY_BYTES = 1_048_576;
export const MAX_PAGES = 5;
/** One more than the cap of the tools: the caller must see the overflow. */
export const MAX_TOOLS_READ = 51;

/** A tool as the server sent it: nothing in it is trusted yet. */
export interface RawTool {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}

export interface ListOptions {
	url: string;
	/** The header the user chose, in the clear: it lives for this call only. */
	header?: { name: string; value: string };
	deadlineMs?: number;
	maxBodyBytes?: number;
	maxPages?: number;
	/** Tests inject a fetch with a hostile resolver; production uses the guard's. */
	fetchImpl?: GuardedFetch;
}

interface CallState {
	timedOut: boolean;
	tooLarge: boolean;
	network: boolean;
	/** Ends the call now: the SDK keeps a broken event stream pending and retries it. */
	abort: () => void;
}

/** The body, cut the moment it passes the cap. */
function capBody(response: Response, state: CallState, max: number): Response {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > max) {
		state.tooLarge = true;
		state.abort();
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
					state.tooLarge = true;
					state.abort();
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

/** The fetch the SDK is given: the guard, the 405 on GET, the cap, the deadline. */
function buildFetch(fetchImpl: GuardedFetch, state: CallState, deadline: AbortSignal, max: number) {
	return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		if ((init?.method ?? 'GET').toUpperCase() !== 'POST') {
			return new Response(null, { status: 405 });
		}
		checkEndpointUrl(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
		const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
		let response: Response;
		try {
			response = await fetchImpl(input, { ...init, signal });
		} catch (error) {
			state.network = true;
			throw error;
		}
		return capBody(response, state, max);
	};
}

/**
 * The one place a raw error becomes ours.
 *
 * The state flags decide, not the type or the text of the error: the SDK
 * wraps what it catches, and its messages quote the server.
 */
export function toFailure(state: CallState, error: unknown): McpFailure {
	if (error instanceof McpFailure) return error;
	if (state.tooLarge) return new McpFailure('mcp_too_large');
	if (state.timedOut) return new McpFailure('mcp_timeout');
	if (state.network) return new McpFailure('mcp_unreachable');
	return new McpFailure('mcp_protocol');
}

/** Lists the tools of one server: up to `maxPages` pages, 51 tools at most. */
export async function listServerTools(options: ListOptions): Promise<RawTool[]> {
	const controller = new AbortController();
	const state: CallState = { timedOut: false, tooLarge: false, network: false, abort: () => controller.abort() };
	const deadlineMs = options.deadlineMs ?? TOTAL_DEADLINE_MS;
	const timer = setTimeout(() => {
		state.timedOut = true;
		controller.abort();
	}, deadlineMs);
	let client: Client | null = null;
	try {
		let url: URL;
		try {
			url = checkEndpointUrl(options.url);
		} catch {
			throw new McpFailure('mcp_unreachable');
		}
		const fetchFn = buildFetch(
			options.fetchImpl ?? guardedFetch,
			state,
			controller.signal,
			options.maxBodyBytes ?? MAX_BODY_BYTES,
		);
		const transport = new StreamableHTTPClientTransport(url, {
			fetch: fetchFn,
			requestInit: options.header ? { headers: { [options.header.name]: options.header.value } } : {},
		});
		client = new Client({ name: 'osionos-ai', version: '1.0.0' }, { capabilities: {} });
		await client.connect(transport, { signal: controller.signal, timeout: deadlineMs });
		const tools: RawTool[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < (options.maxPages ?? MAX_PAGES); page++) {
			// request(), not listTools(): listTools compiles the outputSchema of
			// every tool with Ajv before we can look at it (C277).
			const result = await client.request(
				{ method: 'tools/list', params: cursor ? { cursor } : {} },
				ListToolsResultSchema,
				{ signal: controller.signal, timeout: deadlineMs },
			);
			for (const tool of result.tools) {
				tools.push({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema as Record<string, unknown>,
				});
			}
			cursor = result.nextCursor;
			if (!cursor || tools.length >= MAX_TOOLS_READ) break;
		}
		return tools;
	} catch (error) {
		throw toFailure(state, error);
	} finally {
		clearTimeout(timer);
		controller.abort();
		await client?.close().catch(() => undefined);
	}
}
