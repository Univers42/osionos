import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

/**
 * The child of the "catalog out of reach" case.
 *
 * The service reads its configuration when it is imported, and the copy of the
 * catalog lives in the memory of the process: the case needs a process of its
 * own, with a URL that answers nobody. The child asks for the providers and
 * prints their ids.
 */

const USER_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { createAiServer } = await import('../src/server.ts');

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

const token = signAppSessionToken({
	payload: { subject: USER_A, provider: 'test' },
	workspace: { _id: WORKSPACE_A },
	config: {
		appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '',
		sessionTtlSeconds: 3600,
	},
}).token;

const answer = await fetch(`${base}/api/ai/providers`, {
	headers: { authorization: `Bearer ${token}` },
});
const body = (await answer.json()) as { providers?: { id: string }[] };
const ids = (body.providers ?? []).map((provider) => provider.id).join(',');
process.stdout.write(`RESULT ids=${ids}\n`);

await app.close();
process.exit(0);
