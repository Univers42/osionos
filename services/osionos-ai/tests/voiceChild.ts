import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { makeWav } from './voiceFixtures.ts';

/**
 * The child of the "no speech-to-text server" case.
 *
 * The service reads its configuration when it is imported, so the case needs a
 * process of its own: this one starts the service without a STT URL, asks for a
 * dictation, and prints what it got.
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

const answered = await fetch(`${base}/api/ai/voice/transcribe`, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' },
	body: makeWav({ pcmBytes: 320 }),
});
const body = (await answered.json().catch(() => null)) as { error?: { code?: string } } | null;
process.stdout.write(`RESULT status=${answered.status} code=${body?.error?.code ?? 'none'}\n`);

// The child is thrown away: it leaves as soon as it has said its piece, so it
// never holds the pipes of the parent open.
await new Promise((resolve) => setTimeout(resolve, 100));
process.exit(0);
