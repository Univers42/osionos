import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

/**
 * The service on a free port with a free mock model, for the route tests that
 * need no upstream (the sentiment routes). The full harness is harness.ts.
 */

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

/** A token the way the bridge signs one: the same module, the test's secret. */
export function tokenFor(userId: string, workspaceId: string = randomUUID()): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
	}).token;
}

/** Starts the service and resolves to its base URL. */
export async function serveAi(): Promise<string> {
	process.env.OSIONOS_AI_PLATFORM_MODELS ??= JSON.stringify([
		{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
	]);
	const { createAiServer } = await import('../src/server.ts');
	const app = createAiServer();
	await new Promise<void>((resolve) => {
		app.server.listen(0, '127.0.0.1', () => resolve());
	});
	// The server starts at import, so it closes at file level: closed inside the suite, a skipped suite left it
	// listening and the file never exited (the whole service suite hung 30 min without the sentiment migration, 2026-10-23).
	after(async () => {
		await app.close();
	});
	const address = app.server.address();
	return `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
}
