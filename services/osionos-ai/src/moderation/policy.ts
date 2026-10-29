/**
 * The policy of the L1 moderation worker: what the environment says, and what
 * the worker may actually do (devil C83, C85).
 *
 * The configured mode is the operator's wish; the EFFECTIVE mode is what the
 * worker does:
 *   off   no worker.
 *   log   score and audit, change nothing.
 *   hold  score, audit, and move a toxic comment to 'held'.
 *   on    would auto-remove. REFUSED: no language has the per-language
 *         precision evidence C83 asks for (A1: no threshold reaches 0.95 on
 *         HateCheck), so `on` behaves as `hold`.
 * A policy whose hash is not the calibrated one (C85: model, revision or
 * threshold changed) is `log` until someone recalibrates and sets
 * OSIONOS_MODERATION_CALIBRATED_POLICY to the new hash.
 *
 * Read from the environment on its own, not through src/config.ts: the worker
 * is a second entrypoint (like the indexer) and must not need the HTTP
 * service's secrets to start.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

/** The model of models.lock (tox-xlmr-large) and its pinned revision. */
export const DEFAULT_MODEL = 'textdetox/xlmr-large-toxicity-classifier-v2';
export const DEFAULT_REVISION = '38ab1b77bd3ff7779777cfa5cda203d9912b14b9';
/** The toxic score from which a comment is held. */
export const DEFAULT_HOLD = 0.9;

export type ConfiguredMode = 'off' | 'log' | 'hold' | 'on';
export type EffectiveMode = 'off' | 'log' | 'hold';

/** What the policy hash covers: the decision's inputs. */
export interface PolicyInputs {
	model: string;
	revision: string;
	hold: number;
}

export interface ModerationPolicy extends PolicyInputs {
	configured: ConfiguredMode;
	/** What the worker does. */
	mode: EffectiveMode;
	/** Whether a worker runs at all. */
	runsWorker: boolean;
	/** The operator asked for `on` and was refused. */
	removeRefused: boolean;
	/** Whether the hash is the calibrated one. */
	calibrated: boolean;
	policyHash: string;
	l1Url: string;
}

/**
 * The sha256 hex of the canonical JSON {model, revision, hold}. The key order
 * is fixed here, so the hash does not depend on how a caller built the object.
 */
export function computePolicyHash(inputs: PolicyInputs): string {
	const canonical = JSON.stringify({ model: inputs.model, revision: inputs.revision, hold: inputs.hold });
	return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const schema = z.object({
	OSIONOS_MODERATION_ACTIONS: z.enum(['off', 'log', 'hold', 'on']).default('log'),
	OSIONOS_MODERATION_L1_URL: z.string().optional(),
	OSIONOS_MODERATION_L1_MODEL: z.string().min(1).default(DEFAULT_MODEL),
	OSIONOS_MODERATION_L1_REVISION: z.string().min(1).default(DEFAULT_REVISION),
	OSIONOS_MODERATION_L1_HOLD: z.coerce.number().gt(0).lte(1).default(DEFAULT_HOLD),
	OSIONOS_MODERATION_CALIBRATED_POLICY: z.string().optional(),
});

// An empty variable is an unset one, so a compose file can pass `${VAR:-}`.
function clean(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const key of Object.keys(schema.shape)) {
		const value = env[key]?.trim();
		out[key] = value === undefined || value === '' ? undefined : value;
	}
	return out;
}

/**
 * The policy of an environment. It throws, naming the variable (never a
 * value), when the environment is invalid.
 */
export function resolvePolicy(env: Record<string, string | undefined>): ModerationPolicy {
	const parsed = schema.safeParse(clean(env));
	if (!parsed.success) {
		const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
		throw new Error(`invalid moderation environment variables: ${names.join(', ')}`);
	}
	const values = parsed.data;
	const configured = values.OSIONOS_MODERATION_ACTIONS;
	const l1Url = values.OSIONOS_MODERATION_L1_URL ?? '';
	if (configured !== 'off' && l1Url === '') {
		throw new Error('invalid moderation environment variables: OSIONOS_MODERATION_L1_URL');
	}
	const inputs: PolicyInputs = {
		model: values.OSIONOS_MODERATION_L1_MODEL,
		revision: values.OSIONOS_MODERATION_L1_REVISION,
		hold: values.OSIONOS_MODERATION_L1_HOLD,
	};
	const policyHash = computePolicyHash(inputs);
	const calibrated = values.OSIONOS_MODERATION_CALIBRATED_POLICY === policyHash;
	let mode: EffectiveMode = configured === 'on' ? 'hold' : configured;
	if (mode === 'hold' && !calibrated) mode = 'log';
	return {
		...inputs,
		configured,
		mode,
		runsWorker: configured !== 'off',
		removeRefused: configured === 'on',
		calibrated,
		policyHash,
		l1Url,
	};
}
