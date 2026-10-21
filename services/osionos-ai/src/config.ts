import { z } from 'zod';

/**
 * The configuration is parsed once, at import time, and frozen.
 *
 * The names are the bridge's names (scripts/bridge-api.mjs, configFromEnv), so one
 * deployment environment drives the bridge and this service: the app-session secret
 * and its TTL are the bridge's, and so are the BaaS URL and the service key the
 * session-cutoff poller reads.
 */

/** The first of several names that carries a value, the bridge's alias order. */
function firstEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name];
		if (value !== undefined && value.trim() !== '') return value;
	}
	return undefined;
}

/**
 * One model of the platform allowlist: what the client sees (the id, the label)
 * and what the budget is charged with (the prices per million tokens).
 *
 * The prices never leave the server: GET /api/ai/models answers with the id, the
 * label and the default flag only.
 */
export interface PlatformModelEntry {
	id: string;
	label: string;
	inputMicroUsdPerMTok: number;
	outputMicroUsdPerMTok: number;
	default: boolean;
}

const platformModelSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	inputMicroUsdPerMTok: z.number().int().nonnegative(),
	outputMicroUsdPerMTok: z.number().int().nonnegative(),
	default: z.boolean().optional(),
});

/** The allowlist: at least one model, exactly one of them the default. */
const platformModelsSchema = z
	.array(platformModelSchema)
	.min(1)
	.superRefine((models, ctx) => {
		if (models.filter((model) => model.default === true).length !== 1) {
			ctx.addIssue({ code: 'custom', message: 'exactly one model must carry the default flag' });
		}
		if (new Set(models.map((model) => model.id)).size !== models.length) {
			ctx.addIssue({ code: 'custom', message: 'model ids must be unique' });
		}
	});

const envSchema = z.object({
	OSIONOS_AI_PORT: z.coerce.number().int().min(0).max(65_535).default(4300),
	OSIONOS_AI_DATABASE_URL: z.string().min(1),
	OSIONOS_AI_REDIS_URL: z.string().min(1),
	OSIONOS_ALLOWED_ORIGIN: z.string().min(1).default('http://localhost:3001'),
	OSIONOS_APP_SESSION_SECRET: z.string().min(1),
	OSIONOS_APP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
	OSIONOS_SESSION_CUTOFFS: z.string().optional(),
	OSIONOS_BAAS_URL: z.string().min(1).default('http://localhost:8000'),
	SERVICE_ROLE_KEY: z.string().default(''),
	OSIONOS_AI_UPSTREAM_BASE_URL: z.string().min(1),
	OSIONOS_AI_UPSTREAM_API_KEY: z.string().optional(),
	OSIONOS_AI_PLATFORM_MODELS: z.string().min(1),
	OSIONOS_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
	OSIONOS_AI_USER_DAILY_MICROUSD: z.coerce.number().int().nonnegative().default(200_000),
	OSIONOS_AI_PLATFORM_DAILY_MICROUSD: z.coerce.number().int().nonnegative().default(20_000_000),
	OSIONOS_AI_RUNS_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

const rawEnv = {
	OSIONOS_AI_PORT: process.env.OSIONOS_AI_PORT,
	OSIONOS_AI_DATABASE_URL: process.env.OSIONOS_AI_DATABASE_URL,
	OSIONOS_AI_REDIS_URL: process.env.OSIONOS_AI_REDIS_URL,
	OSIONOS_ALLOWED_ORIGIN: firstEnv('OSIONOS_ALLOWED_ORIGIN', 'OSIONOS_APP_URL', 'PUBLIC_OSIONOS_APP_URL'),
	OSIONOS_APP_SESSION_SECRET: process.env.OSIONOS_APP_SESSION_SECRET,
	OSIONOS_APP_SESSION_TTL_SECONDS: process.env.OSIONOS_APP_SESSION_TTL_SECONDS,
	OSIONOS_SESSION_CUTOFFS: process.env.OSIONOS_SESSION_CUTOFFS,
	OSIONOS_BAAS_URL: firstEnv('OSIONOS_BAAS_URL', 'PUBLIC_BAAS_URL'),
	SERVICE_ROLE_KEY: firstEnv('SERVICE_ROLE_KEY', 'KONG_SERVICE_API_KEY', 'BAAS_SERVICE_ROLE_KEY'),
	OSIONOS_AI_UPSTREAM_BASE_URL: process.env.OSIONOS_AI_UPSTREAM_BASE_URL,
	// A local runtime needs no key: an empty value is no key at all.
	OSIONOS_AI_UPSTREAM_API_KEY: firstEnv('OSIONOS_AI_UPSTREAM_API_KEY'),
	OSIONOS_AI_PLATFORM_MODELS: process.env.OSIONOS_AI_PLATFORM_MODELS,
	OSIONOS_AI_MAX_OUTPUT_TOKENS: process.env.OSIONOS_AI_MAX_OUTPUT_TOKENS,
	OSIONOS_AI_USER_DAILY_MICROUSD: process.env.OSIONOS_AI_USER_DAILY_MICROUSD,
	OSIONOS_AI_PLATFORM_DAILY_MICROUSD: process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD,
	OSIONOS_AI_RUNS_PER_MINUTE: process.env.OSIONOS_AI_RUNS_PER_MINUTE,
};

const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
	// Names only: an environment value can hold the app-session secret.
	const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))].sort();
	console.error(`[osionos-ai] refusing to start: invalid environment variables: ${names.join(', ')}`);
	process.exit(1);
}

/** A refusal at boot: the name of the variable, never its value. */
function refuse(name: string): never {
	console.error(`[osionos-ai] refusing to start: invalid environment variables: ${name}`);
	process.exit(1);
}

/**
 * The platform allowlist, decoded from its JSON. A broken JSON or a broken shape
 * stops the service the same way a missing variable does.
 */
function parsePlatformModels(raw: string): PlatformModelEntry[] {
	let decoded: unknown;
	try {
		decoded = JSON.parse(raw);
	} catch {
		refuse('OSIONOS_AI_PLATFORM_MODELS');
	}
	const result = platformModelsSchema.safeParse(decoded);
	if (!result.success) refuse('OSIONOS_AI_PLATFORM_MODELS');
	return result.data.map((model) => ({ ...model, default: model.default === true }));
}

export interface AiServiceConfig {
	port: number;
	databaseUrl: string;
	redisUrl: string;
	allowedOrigin: string;
	appSessionSecret: string;
	sessionTtlSeconds: number;
	sessionCutoffsMode: 'on' | 'off';
	baasUrl: string;
	serviceKey: string;
	upstreamBaseUrl: string;
	upstreamApiKey?: string;
	platformModels: readonly PlatformModelEntry[];
	maxOutputTokens: number;
	userDailyMicroUsd: number;
	platformDailyMicroUsd: number;
	runsPerMinute: number;
}

export const config: AiServiceConfig = Object.freeze({
	port: parsed.data.OSIONOS_AI_PORT,
	databaseUrl: parsed.data.OSIONOS_AI_DATABASE_URL,
	redisUrl: parsed.data.OSIONOS_AI_REDIS_URL,
	allowedOrigin: parsed.data.OSIONOS_ALLOWED_ORIGIN,
	appSessionSecret: parsed.data.OSIONOS_APP_SESSION_SECRET,
	sessionTtlSeconds: parsed.data.OSIONOS_APP_SESSION_TTL_SECONDS,
	// The bridge's rule: anything but an explicit "off" keeps the check on.
	sessionCutoffsMode: parsed.data.OSIONOS_SESSION_CUTOFFS?.trim().toLowerCase() === 'off' ? 'off' : 'on',
	baasUrl: parsed.data.OSIONOS_BAAS_URL,
	serviceKey: parsed.data.SERVICE_ROLE_KEY,
	upstreamBaseUrl: parsed.data.OSIONOS_AI_UPSTREAM_BASE_URL,
	upstreamApiKey: parsed.data.OSIONOS_AI_UPSTREAM_API_KEY,
	platformModels: Object.freeze(parsePlatformModels(parsed.data.OSIONOS_AI_PLATFORM_MODELS)),
	maxOutputTokens: parsed.data.OSIONOS_AI_MAX_OUTPUT_TOKENS,
	userDailyMicroUsd: parsed.data.OSIONOS_AI_USER_DAILY_MICROUSD,
	platformDailyMicroUsd: parsed.data.OSIONOS_AI_PLATFORM_DAILY_MICROUSD,
	runsPerMinute: parsed.data.OSIONOS_AI_RUNS_PER_MINUTE,
});
