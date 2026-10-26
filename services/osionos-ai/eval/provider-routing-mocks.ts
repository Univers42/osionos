/* ************************************************************************** */
/*                                                                            */
/*   provider-routing-mocks.ts       the three upstreams of context C393      */
/*                                                                            */
/*   The platform upstream, the upstream of a user's API key and the one of  */
/*   a user's own endpoint: the suite's mock, three times, each answering a  */
/*   long text so a thread overflows the history window in a few runs. The  */
/*   ports go to the file named by the first argument (the proxy in front of */
/*   each mock is configured from it), and port 8100 tells, per upstream,    */
/*   how many calls were summary calls.                                      */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { startMockUpstream } from '../tests/mockUpstream.ts';
import type { MockUpstream } from '../tests/mockUpstream.ts';

const portsFile = process.argv[2];
if (!portsFile) throw new Error('usage: provider-routing-mocks.ts <ports.json>');

// A summary call is the one whose system prompt is the summariser's. Its first
// line is read from the source, so a rewrite of the prompt cannot make every
// call look like a run: no match, no start.
const source = readFileSync(new URL('../src/summary/summarize.ts', import.meta.url), 'utf8');
const summaryLine = /export const SUMMARY_SYSTEM = \[\s*'([^']+)'/.exec(source)?.[1];
if (!summaryLine) throw new Error('SUMMARY_SYSTEM was not found in src/summary/summarize.ts');

const NAMES = ['platform', 'userKey', 'userEndpoint'] as const;
const answer = (name: string) => `Answer of the ${name} upstream. ${'The plan keeps its scope and its dates. '.repeat(170)}`;

const mocks = {} as Record<(typeof NAMES)[number], MockUpstream>;
for (const name of NAMES) mocks[name] = await startMockUpstream({ answerText: answer(name) });
writeFileSync(portsFile, JSON.stringify(Object.fromEntries(NAMES.map((name) => [name, Number(new URL(mocks[name].baseUrl).port)]))));

const isSummary = (body: unknown) => JSON.stringify(body).includes(summaryLine);
createServer((_request, response) => {
	const counts = NAMES.map((name) => [name, { chatCalls: mocks[name].calls, summaryCalls: mocks[name].bodies.filter(isSummary).length }]);
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify(Object.fromEntries(counts)));
}).listen(8100, '0.0.0.0');
console.log(`[mocks] ready: ${NAMES.join(', ')}`);
