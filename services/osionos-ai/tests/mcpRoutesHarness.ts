import { after } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import type { FakeMcp } from './mcpFakeServer.ts';
import { USER_A, USER_B, WORKSPACE_A } from './harness.ts';
import type { JsonBody } from './harness.ts';

/**
 * The service with the MCP client on, a KEK, and the development hosts that
 * let the fake server (plain http on 127.0.0.1) through, plus the few helpers
 * every route test of the E1a slice shares.
 *
 * The environment is set here, before the harness imports the service: the
 * service reads its configuration when it is imported.
 */
export const SECRET = 'Bearer throwaway-mcp-secret-7731';
export { USER_A, USER_B, WORKSPACE_A };

export async function startMcpRoutes() {
	process.env.OSIONOS_AI_MCP_CLIENT = 'on';
	process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 9).toString('base64');
	process.env.OSIONOS_AI_KEK_ID = 'k-mcp';
	process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
	const { startHarness } = await import('./harness.ts');
	const { startFakeMcp } = await import('./mcpFakeServer.ts');
	const harness = await startHarness();
	const fakes: FakeMcp[] = [];
	after(async () => {
		await harness.app.close();
		await harness.mock.close();
		await harness.bridge.close();
		await Promise.all(fakes.map((server) => server.close()));
	});

	const fake = async (initial: Parameters<typeof startFakeMcp>[0] = { tools: [] }): Promise<FakeMcp> => {
		const started = await startFakeMcp(initial);
		fakes.push(started);
		return started;
	};
	const tokenOf = (user: string) => harness.tokenFor(user, WORKSPACE_A);
	/** A session older than the fresh window, signed the way the bridge signs one. */
	const staleTokenOf = (user: string) =>
		signAppSessionToken({
			payload: { subject: user, provider: 'test' },
			workspace: { _id: WORKSPACE_A },
			config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
			now: Date.now() - 11 * 60 * 1000,
		}).token;
	const as = (user: string, method: string, path: string, body?: unknown, token = tokenOf(user)) =>
		harness.call(path, { method, token, body });
	/** A server registered for `user`, its id. */
	const register = async (user: string, server: FakeMcp, extra: JsonBody = {}): Promise<string> => {
		const made = await as(user, 'POST', '/api/ai/mcp-servers', { label: 'fake', url: server.url, ...extra });
		if (made.status !== 201) throw new Error(`register answered ${made.status}`);
		return String(made.body?.id);
	};
	return { ...harness, fake, tokenOf, staleTokenOf, as, register };
}
