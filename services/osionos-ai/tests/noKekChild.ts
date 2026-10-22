import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

/**
 * The child of the "no KEK" case.
 *
 * The service reads its configuration when it is imported, so the case needs
 * a process of its own: this one starts the service without a KEK, asks for
 * a connection and for the list, and prints what it got.
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

const created = await fetch(`${base}/api/ai/connections`, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({ kind: 'api_key', provider: 'openrouter', apiKey: 'sk-nokey-0123456789' }),
});
const createdBody = (await created.json()) as { error?: { code?: string } };

const list = await fetch(`${base}/api/ai/connections`, {
	headers: { authorization: `Bearer ${token}` },
});
const listBody = (await list.json()) as { connections?: { id: string }[] };

const ids = (listBody.connections ?? []).map((entry) => entry.id).join(',');
process.stdout.write(
	`RESULT post=${created.status} code=${createdBody.error?.code ?? 'none'} list=${list.status} connections=${ids}\n`,
);

await app.close();
process.exit(0);
