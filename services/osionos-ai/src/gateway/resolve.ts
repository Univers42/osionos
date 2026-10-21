import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { reserve, settle } from '../budget.ts';
import { getOwnedConnection } from '../connections/repo.ts';
import { connectionBaseUrl, connectionSecret } from '../connections/service.ts';
import { PLATFORM_CONNECTION_ID } from '../connections/service.ts';
import { guardedFetch } from '../connections/endpointGuard.ts';
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
 */
export async function reserveTarget(
	db: Pool,
	target: ResolvedTarget,
	{ userId, day, amount }: { userId: string; day: string; amount: number },
): Promise<boolean> {
	if (!target.platformBudget) return true;
	return reserve(db, {
		userId,
		day,
		amount,
		userLimit: config.userDailyMicroUsd,
		platformLimit: config.platformDailyMicroUsd,
	});
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
 * The target of a request: the platform connection, or one of the user's.
 *
 * A connection that is not the caller's does not exist: the answer is a 404,
 * never a 403.
 */
export async function resolveTarget(
	db: Pool,
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
			},
		};
	}

	const row = await getOwnedConnection(db, { id: wanted, ownerUserId: user.userId });
	if (!row) return { kind: 'refused', status: 404, code: 'not_found' };

	// The model of a user connection is theirs: the allowlist does not know it.
	const model = (modelId ?? '').trim();
	if (!MODEL_ID.test(model)) return { kind: 'refused', status: 400, code: 'invalid_request' };

	const baseUrl = connectionBaseUrl(row);
	if (!baseUrl) return { kind: 'refused', status: 400, code: 'invalid_request' };
	const secret = connectionSecret(row);
	const provider = createOpenAICompatible({
		name: row.provider,
		baseURL: baseUrl,
		...(secret ? { apiKey: secret } : {}),
		// Every call of a user connection goes through the guard.
		fetch: guardedFetch,
	});
	return {
		kind: 'resolved',
		target: {
			model: provider(model),
			modelId: model,
			// The provider of the user bills them: our prices are zero.
			pricing: { id: model, label: model, inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false },
			platformBudget: false,
		},
	};
}
