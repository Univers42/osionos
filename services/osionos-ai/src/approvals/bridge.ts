/**
 * The bridge, from the service.
 *
 * The write goes out with the token of the request that DECIDED it — never
 * with a token of the service, never with a token of the run. The token
 * travels in the Authorization header and nowhere else: not in the URL, not in
 * the body, not in a log line.
 *
 * The URL is operator configuration (OSIONOS_AI_BRIDGE_URL): no argument of a
 * tool, no field of a page and no word of a user can move it. That is what
 * keeps the write path out of the reach of an SSRF.
 */

/** How long a call to the bridge may take. */
export const BRIDGE_TIMEOUT_MS = 8_000;

/** The write the bridge is asked for: a method, a path, and a body. */
export interface BridgeWrite {
	method: 'POST' | 'PATCH';
	path: string;
	body: Record<string, unknown>;
}

/** The answer of the bridge: whether it worked, and what it said. */
export interface BridgeAnswer {
	/** Whether the bridge answered with a 2xx. */
	ok: boolean;
	/** The status of the answer: 0 when the call never landed. */
	status: number;
	/** The body of the answer, cut: a page is a lot of JSON. */
	body: string;
}

/**
 * The call to the bridge.
 *
 * A call that fails is a failure, never a throw: the outcome of an approval
 * is a row, and the row says what happened.
 */
export async function bridgeWrite(
	{
		url,
		token,
		write,
		fetchImpl = fetch,
	}: {
		url: string;
		token: string;
		write: BridgeWrite;
		fetchImpl?: typeof fetch;
	},
): Promise<BridgeAnswer> {
	try {
		const response = await fetchImpl(`${url}${write.path}`, {
			method: write.method,
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify(write.body),
			signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
		});
		const body = await response.text();
		return { ok: response.ok, status: response.status, body: body.slice(0, 4000) };
	} catch {
		// The failure says nothing about the URL and nothing about the token:
		// the log of a write carries the code and the name of the error.
		return { ok: false, status: 0, body: '' };
	}
}

/**
 * The message of a refusal of the bridge: a safe sentence.
 *
 * The body of the bridge may hold the internals of the server, so it is never
 * copied into the row of the approval: the user reads what happened, not what
 * the bridge said.
 */
export function refusalMessage(answer: BridgeAnswer): string {
	if (answer.status === 401 || answer.status === 403) return 'the bridge refused the write: not allowed';
	if (answer.status === 404) return 'the bridge refused the write: the page is gone';
	if (answer.status === 409) return 'the bridge refused the write: the page changed';
	if (answer.status === 0) return 'the bridge did not answer';
	return `the bridge refused the write (${answer.status})`;
}
