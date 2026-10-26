import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { reserve, settle } from '../budget.ts';
import { getOwnedConnection } from '../connections/repo.ts';
import type { ConnectionRow } from '../connections/repo.ts';
import { connectionBaseUrl, connectionSecret } from '../connections/service.ts';
import { PLATFORM_CONNECTION_ID } from '../connections/service.ts';
import { guardedFetch } from '../connections/endpointGuard.ts';
import { ENDPOINT_PROVIDER, providerBaseUrl } from '../connections/providers.ts';
import { providerEntry, providerModels } from '../connections/catalog.ts';
import type { ProviderEntry } from '../connections/providers.ts';
import { costMicroUsd, platformModel, resolveModel } from './platform.ts';
import type { PlatformModelEntry } from './platform.ts';

/**
 * The target of a run: where the model is called, and who pays for it.
 *
 * Two targets exist. The platform connection is ours: the model comes from
 * the allowlist, and the daily budget of the platform pays for it. A
 * connection of the user is theirs: the model is the one they name, the
 * provider bills them, and our ledger stays out of it.
 */

/** A target: the handle of the model, and what it costs us. */
export interface ResolvedTarget {
	/** The handle the model is called through. */
	model: LanguageModel;
	/** The id of the model: the run row and the events carry it. */
	modelId: string;
	/**
	 * The prices of the call: the ones of the allowlist, or zero when the
	 * provider of the user bills them.
	 */
	pricing: PlatformModelEntry;
	/** The platform budget applies to the platform connection only. */
	platformBudget: boolean;
	/** Whether the model accepts image input. */
	vision?: boolean;
	/** The wire of the adapter: it decides which reasoning option is sent. */
	wire: 'openai-compatible' | 'anthropic' | 'google';
	/** The key the adapter reads its provider options under. */
	optionsKey: string;
	/** Whether the model reasons, so an effort applies to it. */
	reasoning: boolean;
}

/** The answer of the resolver: a target, or a refusal. */
export type ResolveOutcome =
	| { kind: 'resolved'; target: ResolvedTarget }
	| { kind: 'refused'; status: number; code: string };

/** The shape of a model id: letters, digits, and the marks of a model name. */
const MODEL_ID = /^[\w.:/@-]{1,200}$/;

/**
 * The cost of a call on a target: the prices of the allowlist, or nothing at
 * all when the provider of the user bills them.
 */
export function targetCost(target: ResolvedTarget, usage: { inputTokens?: number; outputTokens?: number }): number {
	return costMicroUsd(target.pricing, usage);
}

/**
 * The reservation of a run: the platform pays for the platform connection,
 * and nobody pays for a connection of the user — the provider bills them, and
 * the ledger of the platform must not even see the run.
 *
 * A client may be given: the caller then owns the transaction, and the
 * reservation joins the statements it writes (the row of a run that extends
 * itself and the money of the day, in ONE transaction).
 */
export async function reserveTarget(
	db: Pool,
	target: ResolvedTarget,
	{ userId, day, amount }: { userId: string; day: string; amount: number },
	client?: PoolClient,
): Promise<boolean> {
	if (!target.platformBudget) return true;
	return reserve(
		db,
		{
			userId,
			day,
			amount,
			userLimit: config.userDailyMicroUsd,
			platformLimit: config.platformDailyMicroUsd,
		},
		client,
	);
}

/** The settlement of a run: nothing when the provider of the user bills them. */
export async function settleTarget(
	db: Pool,
	target: ResolvedTarget,
	{ userId, day, reserved, actual }: { userId: string; day: string; reserved: number; actual: number },
): Promise<void> {
	if (!target.platformBudget) return;
	await settle(db, { userId, day, reserved, actual });
}

/**
 * The handle of the model of a provider: the adapter of its wire.
 *
 * Every adapter goes through the guard, and every one of them is given the
 * base URL of the provider: the one of the catalog, the built-in one, or the
 * override of the tests.
 *
 * The OpenAI-compatible adapter is asked for the usage (includeUsage sends
 * `stream_options: { include_usage: true }`): an upstream that reports the
 * tokens only when it is asked to would leave the run free. Anthropic and
 * Google report the usage of a stream on their own wire, so they are left
 * alone.
 */
export function modelHandle(entry: ProviderEntry, modelId: string, secret: string | null): LanguageModel {
	const baseURL = providerBaseUrl(entry);
	const key = secret ? { apiKey: secret } : {};
	switch (entry.wire) {
		case 'anthropic':
			return createAnthropic({ name: entry.id, baseURL, ...key, fetch: guardedFetch })(modelId);
		case 'google':
			return createGoogleGenerativeAI({ name: entry.id, baseURL, ...key, fetch: guardedFetch })(modelId);
		default:
			return createOpenAICompatible({
				name: entry.id,
				baseURL,
				...key,
				fetch: guardedFetch,
				includeUsage: true,
			})(modelId);
	}
}

/**
 * The key an adapter reads its provider options under: anthropic and google
 * read their fixed key (anthropic also the adapter name), openai-compatible
 * reads the adapter name, which is the id of the provider.
 */
function optionsKeyOf(entry: ProviderEntry): string {
	if (entry.wire === 'anthropic') return 'anthropic';
	if (entry.wire === 'google') return 'google';
	return entry.id;
}

/**
 * The provider a connection calls.
 *
 * A connection of a provider is that provider of the catalog; an endpoint is
 * the user's own box, which speaks the OpenAI wire.
 */
async function targetProvider(
	redis: Redis,
	row: ConnectionRow,
	baseUrl: string,
): Promise<ProviderEntry | null> {
	if (row.kind === 'endpoint') return { ...ENDPOINT_PROVIDER, baseUrl };
	const entry = await providerEntry(redis, row.provider);
	return entry && entry.wire ? entry : null;
}

/**
 * The target of a request: the platform connection, or one of the user's.
 *
 * A connection that is not the caller's does not exist: the answer is a 404,
 * never a 403.
 */
export async function resolveTarget(
	db: Pool,
	redis: Redis,
	user: AuthUser,
	connectionId: string | undefined,
	modelId?: string,
): Promise<ResolveOutcome> {
	const wanted = (connectionId ?? '').trim() || PLATFORM_CONNECTION_ID;
	if (wanted === PLATFORM_CONNECTION_ID) {
		const entry = resolveModel(modelId);
		if (!entry) return { kind: 'refused', status: 400, code: 'model_not_allowed' };
		return {
			kind: 'resolved',
			target: {
				model: platformModel(entry.id),
				modelId: entry.id,
				pricing: entry,
				platformBudget: true,
				vision: entry.vision === true,
				wire: 'openai-compatible',
				optionsKey: 'platform',
				reasoning: entry.reasoning === true,
			},
		};
	}

	const row = await getOwnedConnection(db, { id: wanted, ownerUserId: user.userId });
	if (!row) return { kind: 'refused', status: 404, code: 'not_found' };

	// The model of a user connection is theirs: the allowlist does not know it.
	const model = (modelId ?? '').trim();
	if (!MODEL_ID.test(model)) return { kind: 'refused', status: 400, code: 'invalid_request' };

	const baseUrl = await connectionBaseUrl(redis, row);
	if (!baseUrl) return { kind: 'refused', status: 400, code: 'invalid_request' };
	const entry = await targetProvider(redis, row, baseUrl);
	if (!entry) return { kind: 'refused', status: 400, code: 'provider_not_supported' };
	const secret = connectionSecret(row);
	// Only the catalog says a model reasons; an endpoint of the user does not.
	const catalogReasoning = row.kind !== 'endpoint'
		&& (await providerModels(redis, row.provider)).some((m) => m.id === model && m.reasoning === true);
	return {
		kind: 'resolved',
		target: {
			model: modelHandle(entry, model, secret),
			modelId: model,
			// The provider of the user bills them: our prices are zero.
			pricing: { id: model, label: model, inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false },
			platformBudget: false,
			vision: false,
			wire: entry.wire === 'anthropic' || entry.wire === 'google' ? entry.wire : 'openai-compatible',
			optionsKey: optionsKeyOf(entry),
			reasoning: catalogReasoning,
		},
	};
}
