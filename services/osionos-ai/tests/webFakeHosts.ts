import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import type { GuardedFetch } from '../src/connections/endpointGuard.ts';
import { WebFailure } from '../src/web/failure.ts';

/**
 * Fake web hosts for the web tests: the fetcher keeps its `https://<name>/`
 * URLs while the bytes travel over a real socket to a node:http server on
 * 127.0.0.1, so the fetcher logic (redirects, caps, deadlines, socket
 * cleanup) runs against real streams.
 *
 * The routing fetch is NOT the guard: it connects to loopback, which the
 * guard exists to refuse. The guard has its own tests against a hostile
 * resolver (tests/webFetcher.test.ts, C343).
 */
export type Handler = (request: IncomingMessage, response: ServerResponse) => void;

export interface Seen {
	host: string;
	url: string;
	rawHeaders: string[];
}

export class FakeWeb {
	/** The host name of every call the fetcher made, refused-and-never-reached ones included. */
	readonly contacted: string[] = [];
	/** What the servers received, in order. */
	readonly seen: Seen[] = [];
	private readonly servers = new Map<string, { server: Server; port: number }>();
	private readonly sockets = new Set<Socket>();
	private readonly unfinished = new Set<ServerResponse>();
	private readonly agent = new Agent();

	async host(name: string, handler: Handler): Promise<void> {
		const server = createServer((request, response) => {
			this.seen.push({ host: name, url: request.url ?? '', rawHeaders: request.rawHeaders });
			this.unfinished.add(response);
			response.on('close', () => this.unfinished.delete(response));
			handler(request, response);
		});
		server.on('connection', (socket) => {
			this.sockets.add(socket);
			socket.on('close', () => this.sockets.delete(socket));
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		this.servers.set(name, { server, port: (server.address() as AddressInfo).port });
	}

	readonly fetchImpl: GuardedFetch = async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
		this.contacted.push(url.hostname);
		const route = this.servers.get(url.hostname);
		if (!route) throw new TypeError('fetch failed');
		const call = undiciFetch as unknown as (target: string, options: unknown) => Promise<Response>;
		return call(`http://127.0.0.1:${route.port}${url.pathname}${url.search}`, { ...init, dispatcher: this.agent });
	};

	/** Server-side count of sockets still open. */
	openSockets(): number {
		return this.sockets.size;
	}

	/**
	 * Waits (bounded) until no response is left half-sent; true when none is.
	 * Not "no socket": the robots answer leaves an idle keep-alive socket in the
	 * client pool, and whether the page reuses it is a race in undici (this
	 * assertion flaked 5 runs in 25 when it counted sockets). A response still
	 * open is a client that did not cancel.
	 */
	async socketsClosed(withinMs = 3000): Promise<boolean> {
		const end = Date.now() + withinMs;
		while (this.unfinished.size > 0 && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 20));
		return this.unfinished.size === 0;
	}

	async close(): Promise<void> {
		await this.agent.close();
		for (const socket of this.sockets) socket.destroy();
		await Promise.all([...this.servers.values()].map(({ server }) => new Promise((resolve) => server.close(resolve))));
	}
}

/** A handler that answers HTML. */
export function html(body: string, headers: Record<string, string> = {}): Handler {
	return (_request, response) => {
		response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
		response.end(body);
	};
}

export function redirect(location: string | null, status = 302): Handler {
	return (_request, response) => {
		response.writeHead(status, location === null ? {} : { location });
		response.end();
	};
}

/** Routes by path; `/robots.txt` is a 404 unless the table says otherwise. */
export function routes(table: Record<string, Handler>): Handler {
	return (request, response) => {
		const path = (request.url ?? '/').split('?')[0];
		const handler = table[path];
		if (handler) handler(request, response);
		else {
			response.writeHead(404, { 'content-type': 'text/plain' });
			response.end('not found');
		}
	};
}

export function robotsTxt(body: string): Handler {
	return (_request, response) => {
		response.writeHead(200, { 'content-type': 'text/plain' });
		response.end(body);
	};
}

/** The failure a call ends in; its message is always its code (C368). */
export async function failureOf(call: Promise<unknown>): Promise<WebFailure> {
	try {
		await call;
	} catch (error) {
		assert.ok(error instanceof WebFailure, `only WebFailure may escape, got ${String(error)}`);
		assert.equal(error.message, error.code, 'the message is the code, nothing else');
		assert.equal(error.cause, undefined);
		return error;
	}
	return assert.fail('the call should have failed');
}
