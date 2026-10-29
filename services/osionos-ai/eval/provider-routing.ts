/* ************************************************************************** */
/*                                                                            */
/*   provider-routing.ts          the routing proof of the summary (C393)     */
/*                                                                            */
/*   Three threads on the service image, through HTTP only: one on the       */
/*   platform default, one on a user's API key, one on a user's own          */
/*   endpoint. Each thread runs until the history window drops turns and the */
/*   summary is written. The proof is the access log of the proxy in front   */
/*   of each upstream: while a user thread runs, the platform proxy logs     */
/*   nothing, and the summary call lands on the user's upstream. The         */
/*   platform thread is the control: it must reach the platform proxy, so a  */
/*   stack that summarises nothing cannot pass.                              */
/*                                                                            */
/*   Caveat: the stack runs the image with NODE_ENV=development, because     */
/*   production refuses a user endpoint on a private network (the endpoint   */
/*   guard) and the provider URL override; the routing code is the same in  */
/*   both modes. The proxy counts requests per upstream, so a call to a      */
/*   fourth host (not one of the three) is not seen here.                    */
/*                                                                            */
/*   Node 22, the service's own test helpers, the stack of                   */
/*   eval/provider-routing.sh.                                               */
/* ************************************************************************** */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { SseStream, collect } from '../tests/sse.ts';

const AI_URL = (process.env.AI_URL ?? '').replace(/\/+$/, '');
const LOG_DIR = process.env.LOG_DIR ?? '';
const MOCKS_URL = process.env.MOCKS_URL ?? '';
const USER_ENDPOINT_URL = process.env.USER_ENDPOINT_URL ?? '';
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MODEL = 'mock-model';
// Each answer is about 6 900 characters: the window (24 000) drops the first
// turn on the fourth or fifth run.
const MAX_RUNS = 8;

const UPSTREAMS = ['platform', 'userKey', 'userEndpoint'] as const;
type Upstream = (typeof UPSTREAMS)[number];

const token = signAppSessionToken({
	payload: { subject: USER, provider: 'eval' },
	workspace: { _id: WORKSPACE },
	config: { appSessionSecret: SECRET, sessionTtlSeconds: 3600 },
}).token;

async function call(route: string, options: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
	const response = await fetch(`${AI_URL}${route}`, {
		method: options.method ?? 'GET',
		headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

/** The requests each proxy logged so far: one line per request. */
function proxyLines(): Record<Upstream, string[]> {
	const read = (name: Upstream) => readFileSync(path.join(LOG_DIR, `${name}.log`), 'utf8').split('\n').filter(Boolean);
	return { platform: read('platform'), userKey: read('userKey'), userEndpoint: read('userEndpoint') };
}

async function mockCounts(): Promise<Record<Upstream, { chatCalls: number; summaryCalls: number }>> {
	return (await (await fetch(MOCKS_URL)).json()) as Record<Upstream, { chatCalls: number; summaryCalls: number }>;
}

async function summaryOf(conversationId: string): Promise<string | null> {
	const answer = await call(`/api/ai/conversations/${conversationId}/messages`);
	const summary = answer.body?.summary as { text?: string } | null | undefined;
	return summary?.text ?? null;
}

/** The summary is written after `done`, outside the request: it is waited for. */
async function waitForSummary(conversationId: string): Promise<string | null> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		const summary = await summaryOf(conversationId);
		if (summary) return summary;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return null;
}

interface Scenario {
	name: string;
	/** The upstream the thread must use, and the only one it may use. */
	upstream: Upstream;
	selection: Record<string, unknown>;
}

interface Outcome {
	name: string;
	runs: number;
	summary: boolean;
	/** The requests each proxy logged during the thread. */
	logged: Record<Upstream, number>;
	/** The calls each mock took during the thread, and how many were summaries. */
	mock: Record<Upstream, { chatCalls: number; summaryCalls: number }>;
	pass: boolean;
}

async function thread(scenario: Scenario): Promise<Outcome> {
	const linesBefore = proxyLines();
	const mockBefore = await mockCounts();
	const created = await call('/api/ai/conversations', { method: 'POST', body: { workspaceId: WORKSPACE, title: `C393 ${scenario.name}` } });
	if (created.status !== 201 || typeof created.body?.id !== 'string') throw new Error(`${scenario.name}: conversation ${created.status}`);
	const conversationId = created.body.id;
	let runs = 0;
	let summary: string | null = null;
	while (runs < MAX_RUNS && !summary) {
		runs += 1;
		const response = await fetch(`${AI_URL}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), conversationId, text: `Question ${runs} of the ${scenario.name} thread: what is next?`, ...scenario.selection }),
		});
		const events = await collect(new SseStream(response));
		const last = events.at(-1);
		if (last?.event !== 'done') throw new Error(`${scenario.name}: run ${runs} ended with ${JSON.stringify(last)}`);
		const truncated = events.some((event) => event.event === 'context.truncated');
		if (truncated) summary = await waitForSummary(conversationId);
	}
	const linesAfter = proxyLines();
	const mockAfter = await mockCounts();
	const logged = Object.fromEntries(UPSTREAMS.map((name) => [name, linesAfter[name].length - linesBefore[name].length])) as Record<Upstream, number>;
	const mock = Object.fromEntries(
		UPSTREAMS.map((name) => [
			name,
			{ chatCalls: mockAfter[name].chatCalls - mockBefore[name].chatCalls, summaryCalls: mockAfter[name].summaryCalls - mockBefore[name].summaryCalls },
		]),
	) as Outcome['mock'];
	const others = UPSTREAMS.filter((name) => name !== scenario.upstream);
	const pass =
		summary !== null &&
		others.every((name) => logged[name] === 0) &&
		logged[scenario.upstream] >= runs + 1 &&
		mock[scenario.upstream].summaryCalls >= 1 &&
		others.every((name) => mock[name].chatCalls === 0);
	return { name: scenario.name, runs, summary: summary !== null, logged, mock, pass };
}

// The two connections of the user. Creating them is not a thread: the probe
// of the endpoint's /models is logged before any thread starts.
const keyConnection = await call('/api/ai/connections', { method: 'POST', body: { kind: 'api_key', provider: 'openrouter', apiKey: 'sk-or-c393-user-key' } });
const endpointConnection = await call('/api/ai/connections', {
	method: 'POST',
	body: { kind: 'endpoint', label: 'C393 endpoint', baseUrl: USER_ENDPOINT_URL, apiKey: 'sk-c393-endpoint-key' },
});
for (const [label, created] of [['api key', keyConnection], ['endpoint', endpointConnection]] as const) {
	if (created.status !== 201 || typeof created.body?.id !== 'string') throw new Error(`${label} connection: ${created.status} ${JSON.stringify(created.body)}`);
}

const outcomes = [
	await thread({ name: 'platform default (control)', upstream: 'platform', selection: {} }),
	await thread({ name: "user's API key", upstream: 'userKey', selection: { connectionId: keyConnection.body?.id, model: MODEL } }),
	await thread({ name: "user's own endpoint", upstream: 'userEndpoint', selection: { connectionId: endpointConnection.body?.id, model: MODEL } }),
];
const pass = outcomes.every((outcome) => outcome.pass);

const row = (outcome: Outcome) =>
	`| ${outcome.name} | ${outcome.runs} | ${outcome.summary ? 'yes' : 'no'} | ${UPSTREAMS.map((name) => outcome.logged[name]).join(' | ')} | ${UPSTREAMS.map((name) => `${outcome.mock[name].chatCalls} (${outcome.mock[name].summaryCalls})`).join(' | ')} | ${outcome.pass ? 'PASS' : 'FAIL'} |`;

const report = `# Provider routing of the summary — context C393

A run on a user's connection, in a thread long enough to be summarised, sends nothing to the platform upstream:
the summary is written by the connection the run answered with (C377), on the service image, through HTTP only.

- Date: ${process.env.AI_EVAL_DATE ?? new Date().toISOString()}
- Commit: ${process.env.AI_EVAL_COMMIT ?? 'unknown'}
- Image: ${process.env.AI_EVAL_IMAGE ?? 'unknown'}
- Command: \`${process.env.AI_EVAL_COMMAND ?? 'sh services/osionos-ai/eval/provider-routing.sh'}\`

## Result: ${pass ? 'PASS' : 'FAIL'}

Requests logged by the proxy in front of each upstream during each thread, then the calls each mock took (in
brackets: the summary calls among them).

| Thread | Runs | Summary written | Platform proxy | User key proxy | User endpoint proxy | Platform mock | User key mock | User endpoint mock | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${outcomes.map(row).join('\n')}

A thread passes when its summary is written, every request it caused went to its own upstream (runs and the
summary call), and the two other proxies logged none. The platform thread is the control: it shows that the
platform proxy does log the summary call when the platform is the target.

## Caveat

The image runs with NODE_ENV=development: production refuses a user endpoint on a private network and the provider
URL override that sends the user's API key to a mock. The routing code is the same in both modes. The proxies
count requests per upstream; a call to a host that is none of the three would not show here.
`;

const here = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(path.join(here, process.env.AI_EVAL_RESULTS_FILE ?? 'RESULTS-provider-routing.md'), report);
for (const outcome of outcomes) console.log(`[routing] ${outcome.name}: ${JSON.stringify({ runs: outcome.runs, logged: outcome.logged, mock: outcome.mock })} ${outcome.pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
