import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { kekAvailable } from '../connections/crypto.ts';
import { checkEndpointUrl } from '../connections/endpointGuard.ts';
import { providerEntries, providerEntry } from '../connections/catalog.ts';
import { toContractProvider } from '../connections/providers.ts';
import {
	connectionSecret,
	createConnection,
	platformConnection,
	toConnection,
	testConnection,
} from '../connections/service.ts';
import {
	countOwnedConnections,
	deleteOwnedConnection,
	getOwnedConnection,
	listOwnedConnections,
	updateConnectionStatus,
} from '../connections/repo.ts';
import { completeOpenRouterOAuth, startOpenRouterOAuth } from '../connections/openrouterOAuth.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The connections of the user: the platform one, and the ones they bring.
 *
 * A connection of somebody else is a 404, never a 403: the answer must not
 * tell that it exists. The key never leaves the server: the answer carries
 * the last four characters of it, and nothing else.
 */

/** The cap of the connections of a user. */
const MAX_CONNECTIONS = 20;

const createConnectionSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('api_key'),
		provider: z.string().min(1).max(64),
		apiKey: z.string().min(8).max(512),
		label: z.string().max(80).optional(),
	}),
	z.object({
		kind: z.literal('endpoint'),
		label: z.string().min(1).max(80),
		baseUrl: z.string().min(1).max(2048),
		apiKey: z.string().min(8).max(512).optional(),
	}),
]);

const oauthStartSchema = z.object({
	returnUrl: z.string().min(1).max(2048),
});

const oauthCompleteSchema = z.object({
	code: z.string().min(1).max(2048),
	state: z.string().min(1).max(256),
});

/** GET /api/ai/providers */
export async function handleProviders(ctx: RouteContext): Promise<number> {
	if (!requireUser(ctx)) return 401;
	const entries = await providerEntries(ctx.deps.redis);
	const status = 200;
	sendJson(ctx.response, status, { providers: entries.map(toContractProvider) });
	return status;
}

/** GET /api/ai/connections */
async function handleListConnections(ctx: RouteContext, user: AuthUser): Promise<number> {
	// Without a KEK the service cannot open a secret, so it serves the
	// platform connection and nothing else.
	const rows = kekAvailable() ? await listOwnedConnections(ctx.deps.db, user.userId) : [];
	const status = 200;
	sendJson(ctx.response, status, { connections: [platformConnection(), ...rows.map(toConnection)] });
	return status;
}

/**
 * POST /api/ai/connections
 *
 * The connection is tested once before it is answered: the client sees the
 * status of the test in the answer, and finds it again in the list.
 */
async function handleCreateConnection(ctx: RouteContext, user: AuthUser): Promise<number> {
	if (!kekAvailable()) {
		sendError(ctx.response, 503, 'connections_unavailable');
		return 503;
	}
	const body = await readJson(ctx.request, createConnectionSchema);
	const count = await countOwnedConnections(ctx.deps.db, user.userId);
	if (count >= MAX_CONNECTIONS) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	let provider = 'endpoint';
	let label = '';
	let baseUrl: string | null = null;
	if (body.kind === 'api_key') {
		const entry = await providerEntry(ctx.deps.redis, body.provider);
		// The entry of the user's own endpoint is not a provider of keys: it
		// is a connection of its own kind.
		if (!entry || !entry.supported || entry.kind === 'endpoint') {
			sendError(ctx.response, 400, 'provider_not_supported');
			return 400;
		}
		provider = entry.id;
		label = body.label?.trim() || entry.name;
	} else {
		// The URL of the user is the door to the inside of a network: the
		// guard has the last word, and it refuses with 400.
		baseUrl = checkEndpointUrl(body.baseUrl).toString();
		label = body.label.trim();
	}
	const row = await createConnection(ctx.deps.db, user.userId, {
		kind: body.kind,
		provider,
		label,
		baseUrl,
		apiKey: body.apiKey ?? null,
	});
	const tested = await testConnection(ctx.deps.redis, row, connectionSecret(row));
	await updateConnectionStatus(ctx.deps.db, row.id, tested.status, tested.statusMessage);
	const status = 201;
	sendJson(ctx.response, status, toConnection({ ...row, status: tested.status, status_message: tested.statusMessage }));
	return status;
}

/** POST /api/ai/connections/:id/test */
export async function handleConnectionTest(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const row = await getOwnedConnection(ctx.deps.db, { id: ctx.params[0] ?? '', ownerUserId: user.userId });
	if (!row) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	if (row.secret_box && !kekAvailable()) {
		sendError(ctx.response, 503, 'connections_unavailable');
		return 503;
	}
	const tested = await testConnection(ctx.deps.redis, row, connectionSecret(row));
	await updateConnectionStatus(ctx.deps.db, row.id, tested.status, tested.statusMessage);
	const status = 200;
	sendJson(ctx.response, status, toConnection({ ...row, status: tested.status, status_message: tested.statusMessage }));
	return status;
}

/** DELETE /api/ai/connections/:id */
export async function handleConnectionDelete(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const deleted = await deleteOwnedConnection(ctx.deps.db, {
		id: ctx.params[0] ?? '',
		ownerUserId: user.userId,
	});
	if (!deleted) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const status = 204;
	sendNoContent(ctx.response);
	return status;
}

/**
 * POST /api/ai/connections/oauth/openrouter/start
 *
 * The URL of the sign-in: the browser goes there, and comes back with a code.
 * A `returnUrl` of another site is refused: the sign-in never becomes an open
 * redirect.
 */
export async function handleOAuthStart(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	// Without a KEK the service cannot seal the key the sign-in brings.
	if (!kekAvailable()) {
		sendError(ctx.response, 503, 'connections_unavailable');
		return 503;
	}
	const body = await readJson(ctx.request, oauthStartSchema);
	const url = await startOpenRouterOAuth(ctx.deps.redis, { userId: user.userId, returnUrl: body.returnUrl });
	if (!url) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const status = 200;
	sendJson(ctx.response, status, { url });
	return status;
}

/**
 * POST /api/ai/connections/oauth/openrouter/complete
 *
 * The code becomes a connection: a 201 with the connection, and the key it
 * carries never leaves the server.
 */
export async function handleOAuthComplete(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (!kekAvailable()) {
		sendError(ctx.response, 503, 'connections_unavailable');
		return 503;
	}
	const body = await readJson(ctx.request, oauthCompleteSchema);
	const outcome = await completeOpenRouterOAuth(ctx.deps.db, ctx.deps.redis, {
		userId: user.userId,
		code: body.code,
		state: body.state,
	});
	// A state that is missing, expired or another user's is a 404: the sign-in
	// does not exist for this caller.
	if (outcome.kind === 'not_found') {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	// The exchange failed: the code was refused, and no row was written.
	if (outcome.kind === 'exchange_failed') {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const status = 201;
	sendJson(ctx.response, status, toConnection(outcome.row));
	return status;
}

/** GET and POST /api/ai/connections */
export async function handleConnections(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (ctx.request.method === 'POST') return handleCreateConnection(ctx, user);
	if (ctx.request.method === 'GET') return handleListConnections(ctx, user);
	sendError(ctx.response, 405, 'method_not_allowed');
	return 405;
}
