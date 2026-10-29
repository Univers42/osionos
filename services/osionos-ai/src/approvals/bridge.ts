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

/** How much of an answer is kept by default: a page is a lot of JSON, and a row keeps a short result. */
export const BRIDGE_BODY_MAX_CHARS = 4_000;

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
		timeoutMs = BRIDGE_TIMEOUT_MS,
		maxBodyChars = BRIDGE_BODY_MAX_CHARS,
	}: {
		url: string;
		token: string;
		write: BridgeWrite;
		fetchImpl?: typeof fetch;
		timeoutMs?: number;
		/** A caller that parses the answer (the append answers the whole page) asks for more. */
		maxBodyChars?: number;
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
			signal: AbortSignal.timeout(timeoutMs),
		});
		const body = await response.text();
		return { ok: response.ok, status: response.status, body: body.slice(0, maxBodyChars) };
	} catch {
		// The failure says nothing about the URL and nothing about the token:
		// the log of a write carries the code and the name of the error.
		return { ok: false, status: 0, body: '' };
	}
}

/**
 * A read of the bridge: a GET, with the same token and timeout discipline.
 *
 * Like `bridgeWrite`, a failure is a failure, never a throw.
 */
export async function bridgeRead(
	{
		url,
		token,
		path,
		fetchImpl = fetch,
		timeoutMs = BRIDGE_TIMEOUT_MS,
	}: {
		url: string;
		token: string;
		path: string;
		fetchImpl?: typeof fetch;
		timeoutMs?: number;
	},
): Promise<BridgeAnswer> {
	try {
		const response = await fetchImpl(`${url}${path}`, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
			},
			signal: AbortSignal.timeout(timeoutMs),
		});
		const body = await response.text();
		return { ok: response.ok, status: response.status, body: body.slice(0, BRIDGE_BODY_MAX_CHARS) };
	} catch {
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
