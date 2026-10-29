import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The transport guard of the remote MCP endpoint (C118).
 *
 * Its answers carry NO `access-control-allow-*` header: the endpoint is for
 * agents that hold a bearer token, not for pages. A browser page that tries
 * it sends an Origin header, and an Origin that is not on the list is refused
 * before the token is even read.
 *
 * Caveat: the Host check compares the host name (the port is dropped, and an
 * IPv6 literal keeps its brackets). A deployment that must tell two ports of
 * the same host apart needs a reverse proxy in front.
 */

/** A JSON answer of the endpoint: no CORS header, no cache. */
export function sendMcpJson(
	response: ServerResponse,
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): void {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		...headers,
	});
	response.end(JSON.stringify(body));
}

/** A refusal in the envelope of the service: the status and a code. */
export function sendMcpError(response: ServerResponse, status: number, code: string, headers: Record<string, string> = {}): void {
	sendMcpJson(response, status, { ok: false, code, error: { code } }, headers);
}

/** The host name of a Host header: lower-case, without the port. */
export function hostName(header: string | undefined): string {
	const value = (header ?? '').trim().toLowerCase();
	if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
	return value.split(':')[0] ?? '';
}

/**
 * The refusal code of a request that fails the guard, or null when it passes.
 *
 * An Origin header of any value that is not on the list is refused: an
 * agent that is not a browser sends none.
 */
export function guardRefusal(
	request: IncomingMessage,
	allowedHosts: readonly string[],
	allowedOrigins: readonly string[],
): 'host_not_allowed' | 'origin_not_allowed' | null {
	const host = hostName(request.headers.host);
	if (!host || !allowedHosts.some((allowed) => hostName(allowed) === host)) return 'host_not_allowed';
	const origin = request.headers.origin;
	if (origin !== undefined && !allowedOrigins.includes(String(origin))) return 'origin_not_allowed';
	return null;
}
