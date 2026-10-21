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
};

const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
	// Names only: an environment value can hold the app-session secret.
	const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))].sort();
	console.error(`[osionos-ai] refusing to start: invalid environment variables: ${names.join(', ')}`);
	process.exit(1);
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
});
