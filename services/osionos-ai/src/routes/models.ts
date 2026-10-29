import type { Redis } from 'ioredis';
import { sendError, sendJson } from '../http.ts';
import { connectionModels } from '../connections/models.ts';
import { connectionSecret, PLATFORM_CONNECTION_ID } from '../connections/service.ts';
import { getOwnedConnection } from '../connections/repo.ts';
import type { ConnectionRow } from '../connections/repo.ts';
import { providerModels } from '../connections/catalog.ts';
import { platformModels } from '../gateway/platform.ts';
import { restingUntil } from '../runs/cooldown.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The models of the platform, and the models of a connection.
 *
 * The prices stay on the server: the client only needs to show a name.
 */

/** One model of the list, in the shape of the contract. */
interface ListedModel {
	id: string;
	label: string;
	default: boolean;
	vision?: boolean;
	reasoning: boolean;
	contextWindow?: number;
	inputMicroUsdPerMTok?: number;
	outputMicroUsdPerMTok?: number;
	cooldownUntil?: string;
}

/**
 * The models with the end of their rest. Only the caller's own view: the
 * platform key and the caller's own key on it, or the caller's own
 * connection (devil C259).
 */
async function withRest(
	redis: Redis,
	userId: string,
	connectionId: string,
	platform: boolean,
	models: ListedModel[],
): Promise<ListedModel[]> {
	const until = await restingUntil(redis, userId, models.map((model) => ({ connectionId, model: model.id, platform })));
	return models.map((model, index) => {
		const end = until[index];
		return end === undefined ? model : { ...model, cooldownUntil: new Date(end).toISOString() };
	});
}

/**
 * The models of a connection.
 *
 * A provider of the catalog has its models in the catalog: the list comes with
 * the prices and the context window, and it does not cost a call. An endpoint
 * of the user is a box we know nothing about: its own list is asked for.
 */
async function modelsOf(redis: Redis, row: ConnectionRow): Promise<ListedModel[]> {
	if (row.kind !== 'endpoint') {
		const catalog = await providerModels(redis, row.provider);
		if (catalog.length > 0) {
			return catalog.map((model, index) => ({
				id: model.id,
				label: model.label,
				default: index === 0,
				vision: model.vision === true,
				reasoning: model.reasoning === true,
				...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
				...(model.inputMicroUsdPerMTok === undefined ? {} : { inputMicroUsdPerMTok: model.inputMicroUsdPerMTok }),
				...(model.outputMicroUsdPerMTok === undefined ? {} : { outputMicroUsdPerMTok: model.outputMicroUsdPerMTok }),
			}));
		}
	}
	const listed = await connectionModels(redis, row, connectionSecret(row));
	return listed.map((model) => ({ ...model, reasoning: false }));
}

/** GET /api/ai/models */
export async function handleModels(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const connectionId = (ctx.url.searchParams.get('connectionId') ?? '').trim();
	if (!connectionId || connectionId === PLATFORM_CONNECTION_ID) {
		const status = 200;
		const listed: ListedModel[] = platformModels().map((model) => ({ id: model.id, label: model.label, default: model.default, vision: model.vision === true, reasoning: model.reasoning === true }));
		sendJson(ctx.response, status, {
			models: await withRest(ctx.deps.redis, user.userId, PLATFORM_CONNECTION_ID, true, listed),
		});
		return status;
	}
	// A connection of somebody else does not exist for this caller.
	const row = await getOwnedConnection(ctx.deps.db, { id: connectionId, ownerUserId: user.userId });
	if (!row) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const models = await withRest(ctx.deps.redis, user.userId, row.id, false, await modelsOf(ctx.deps.redis, row));
	const status = 200;
	sendJson(ctx.response, status, { models });
	return status;
}
