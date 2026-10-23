import { z } from 'zod';
import { decodePlatformModels, type PlatformModelEntry } from './platformModels.ts';

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

export type { PlatformModelEntry } from './platformModels.ts';

/** The entries of a comma list, trimmed, the empty ones dropped. */
function commaList(value: string | undefined): string[] {
	return (value ?? '').split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
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
	OSIONOS_AI_UPSTREAM_BASE_URL: z.string().min(1),
	OSIONOS_AI_UPSTREAM_API_KEY: z.string().optional(),
	OSIONOS_AI_PLATFORM_MODELS: z.string().min(1),
	OSIONOS_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
	OSIONOS_AI_VISION_TOKENS_PER_IMAGE: z.coerce.number().int().positive().default(1600),
	OSIONOS_AI_USER_DAILY_MICROUSD: z.coerce.number().int().nonnegative().default(200_000),
	OSIONOS_AI_PLATFORM_DAILY_MICROUSD: z.coerce.number().int().nonnegative().default(20_000_000),
	OSIONOS_AI_RUNS_PER_MINUTE: z.coerce.number().int().positive().default(20),
	// The window of the related reads: a kNN over the vectors of a workspace is
	// the most expensive read of the service, and it has its own budget so a
	// client that hammers it cannot spend the budget of the runs.
	OSIONOS_AI_RELATED_PER_MINUTE: z.coerce.number().int().positive().default(60),
	// The window of the device-run sources: the chunks a device run would have
	// quoted, served on the run's own access path. Its own budget, so a client
	// that searches cannot spend the budget of the runs or of the related reads.
	OSIONOS_AI_SOURCES_PER_MINUTE: z.coerce.number().int().positive().default(30),
	// The KEK of the users' own connections: the base64 of exactly 32 bytes.
	// Without it the service serves the platform connection only, and the
	// creation of a connection answers 503 connections_unavailable.
	OSIONOS_AI_KEK: z.string().optional(),
	OSIONOS_AI_KEK_ID: z.string().min(1).default('k1'),
	// The development escape hatch of the SSRF guard: the hosts that may
	// speak http and may live on a private address. Empty in production.
	OSIONOS_AI_DEV_ENDPOINT_HOSTS: z.string().optional(),
	// The base URLs of the built-in providers, overridden for the tests.
	OSIONOS_AI_DEV_PROVIDER_BASE_URLS: z.string().optional(),
	// The catalog of models.dev: the market's providers and their models. It is
	// fetched once a day and shared between the replicas through Redis.
	OSIONOS_AI_CATALOG_URL: z.string().min(1).default('https://models.dev/api.json'),
	// The bridge: where the write tools send their writes. Operator
	// configuration, never a parameter: no model, no user and no workspace may
	// move it. Without it the write tools are NOT registered, and the reads
	// keep working.
	OSIONOS_AI_BRIDGE_URL: z.string().min(1).optional(),
	// The speech-to-text server of the dictation. It is INTERNAL: the URL is a
	// deployment setting (the compose service name), never a caller's, so it is
	// not an endpoint of the users' own. Unset = the service answers 503
	// voice_unavailable: the assistant works, the dictation does not.
	OSIONOS_AI_STT_URL: z.string().optional(),
	// The model the speech-to-text server loads.
	OSIONOS_AI_STT_MODEL: z.string().min(1).default('Systran/faster-whisper-small'),
	// The deadline of one transcription: the call never waits for ever.
	OSIONOS_AI_STT_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
	// The seconds of audio a user may dictate in a day.
	OSIONOS_AI_STT_SECONDS_PER_DAY: z.coerce.number().int().nonnegative().default(600),
	// The image generation (M1). OFF unless exactly "on": the public overlay
	// leaves it empty until the prompt gate (devil C72) and the output gate
	// (C73) exist. Off, the route does not exist.
	OSIONOS_AI_IMAGES: z.string().optional(),
	// The personal access tokens. OFF unless exactly "on": the public overlay
	// leaves it empty until the G4 conditions C112-C120 are merged (devil
	// verdict g-graph-diagrams-mcp-verdict.md). Off, the routes do not exist.
	OSIONOS_AI_PAT: z.string().optional(),
	// The remote MCP endpoint (G4b, devil C118). Comma lists, added to the
	// loopback defaults: the hosts the endpoint answers to (the public host
	// goes here, only when the deployment has one) and the browser origins
	// that may reach it. An empty origin list refuses every request that
	// carries an Origin header; agents that are not browsers send none.
	OSIONOS_AI_MCP_ALLOWED_HOSTS: z.string().optional(),
	OSIONOS_AI_MCP_ALLOWED_ORIGINS: z.string().optional(),
	// The image engine: INTERNAL, the OpenAI-compatible base URL of sd-server
	// (`…/v1`), a deployment setting and never a caller's. Required when on.
	OSIONOS_AI_IMAGE_URL: z.string().optional(),
	// The name the engine is called with, and the one the image's provenance carries.
	OSIONOS_AI_IMAGE_MODEL: z.string().min(1).default('z-image-turbo'),
	// The price of one image on the ledger, in micro-USD: required and above
	// zero when on (C74). The local engine costs no money, but an image that
	// books 0 would never reach the cap of a day.
	OSIONOS_AI_IMAGE_MICROUSD: z.coerce.number().int().nonnegative().default(0),
	// The images of a user in a UTC day, and of the whole platform (C75).
	OSIONOS_AI_IMAGES_PER_USER_DAY: z.coerce.number().int().positive().default(20),
	OSIONOS_AI_IMAGES_PER_DAY: z.coerce.number().int().positive().default(200),
	// The deadline of one generation, from the call to the engine. A1 measured
	// 19–23 s warm and up to 44 s from a cold page cache.
	OSIONOS_AI_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
	// The directory of the models of the output check (devil C73): the two
	// classifiers of the bytes the engine produced, on the disk of the volume.
	// Required when on: a generation without a check is a generation that
	// stores whatever the engine said.
	OSIONOS_AI_IMAGE_CHECK_DIR: z.string().optional(),
	// The prompt guard of the images (devil C72): the L1 classifier of the
	// prompt, INTERNAL — the URL is a deployment setting (the compose service
	// name), never a caller's. Required when on: a prompt that no guard read
	// is a prompt the world may see.
	OSIONOS_AI_PROMPT_GUARD_URL: z.string().optional(),
	// The model the guard is called with.
	OSIONOS_AI_PROMPT_GUARD_MODEL: z.string().min(1).default('guard'),
	// The deadline of one call to the guard: A1 measured 5389 ms at p95 with
	// four clients at once, and 9.5 ms for a server that is not there.
	OSIONOS_AI_PROMPT_GUARD_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
	// "Describe image" (M7): the INTERNAL llama-server with the vision model
	// (`/v1/chat/completions`). Unset or empty = the route is a 404.
	OSIONOS_AI_VLM_URL: z.string().optional(),
	// The model name and revision key the cache: a new revision is a new row.
	// The default is the Qwen2.5-VL-3B Q4_K_M of spikes/a1/models.lock.
	OSIONOS_AI_VLM_MODEL: z.string().min(1).default('qwen2.5-vl-3b-instruct-q4_k_m'),
	OSIONOS_AI_VLM_REVISION: z.string().min(1).default('5037fcf163dd95d1e41d1974465f0898ed108ca2'),
	// One CPU describe took tens of seconds under load (spikes/a1/results/vlm).
	OSIONOS_AI_VLM_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
	// How long a request waits for the single slot before a 429.
	OSIONOS_AI_VLM_QUEUE_WAIT_MS: z.coerce.number().int().positive().default(30_000),
	// The describes of one user in a minute (the window of the rate limiter).
	OSIONOS_AI_DESCRIBE_PER_MINUTE: z.coerce.number().int().positive().default(6),
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
	OSIONOS_AI_VISION_TOKENS_PER_IMAGE: process.env.OSIONOS_AI_VISION_TOKENS_PER_IMAGE,
	OSIONOS_AI_USER_DAILY_MICROUSD: process.env.OSIONOS_AI_USER_DAILY_MICROUSD,
	OSIONOS_AI_PLATFORM_DAILY_MICROUSD: process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD,
	OSIONOS_AI_RUNS_PER_MINUTE: process.env.OSIONOS_AI_RUNS_PER_MINUTE,
	OSIONOS_AI_RELATED_PER_MINUTE: process.env.OSIONOS_AI_RELATED_PER_MINUTE,
	OSIONOS_AI_SOURCES_PER_MINUTE: process.env.OSIONOS_AI_SOURCES_PER_MINUTE,
	OSIONOS_AI_KEK: firstEnv('OSIONOS_AI_KEK'),
	OSIONOS_AI_KEK_ID: process.env.OSIONOS_AI_KEK_ID,
	OSIONOS_AI_DEV_ENDPOINT_HOSTS: process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS,
	OSIONOS_AI_DEV_PROVIDER_BASE_URLS: process.env.OSIONOS_AI_DEV_PROVIDER_BASE_URLS,
	OSIONOS_AI_CATALOG_URL: process.env.OSIONOS_AI_CATALOG_URL,
	OSIONOS_AI_BRIDGE_URL: process.env.OSIONOS_AI_BRIDGE_URL,
	OSIONOS_AI_STT_URL: process.env.OSIONOS_AI_STT_URL,
	OSIONOS_AI_STT_MODEL: process.env.OSIONOS_AI_STT_MODEL,
	OSIONOS_AI_STT_TIMEOUT_MS: process.env.OSIONOS_AI_STT_TIMEOUT_MS,
	OSIONOS_AI_STT_SECONDS_PER_DAY: process.env.OSIONOS_AI_STT_SECONDS_PER_DAY,
	OSIONOS_AI_IMAGES: process.env.OSIONOS_AI_IMAGES,
	OSIONOS_AI_PAT: process.env.OSIONOS_AI_PAT,
	OSIONOS_AI_MCP_ALLOWED_HOSTS: process.env.OSIONOS_AI_MCP_ALLOWED_HOSTS,
	OSIONOS_AI_MCP_ALLOWED_ORIGINS: process.env.OSIONOS_AI_MCP_ALLOWED_ORIGINS,
	OSIONOS_AI_IMAGE_URL: firstEnv('OSIONOS_AI_IMAGE_URL'),
	OSIONOS_AI_IMAGE_MODEL: process.env.OSIONOS_AI_IMAGE_MODEL,
	OSIONOS_AI_IMAGE_MICROUSD: process.env.OSIONOS_AI_IMAGE_MICROUSD,
	OSIONOS_AI_IMAGES_PER_USER_DAY: process.env.OSIONOS_AI_IMAGES_PER_USER_DAY,
	OSIONOS_AI_IMAGES_PER_DAY: process.env.OSIONOS_AI_IMAGES_PER_DAY,
	OSIONOS_AI_IMAGE_TIMEOUT_MS: process.env.OSIONOS_AI_IMAGE_TIMEOUT_MS,
	OSIONOS_AI_IMAGE_CHECK_DIR: process.env.OSIONOS_AI_IMAGE_CHECK_DIR,
	OSIONOS_AI_PROMPT_GUARD_URL: process.env.OSIONOS_AI_PROMPT_GUARD_URL,
	OSIONOS_AI_PROMPT_GUARD_MODEL: process.env.OSIONOS_AI_PROMPT_GUARD_MODEL,
	OSIONOS_AI_PROMPT_GUARD_TIMEOUT_MS: process.env.OSIONOS_AI_PROMPT_GUARD_TIMEOUT_MS,
	OSIONOS_AI_VLM_URL: process.env.OSIONOS_AI_VLM_URL,
	OSIONOS_AI_VLM_MODEL: process.env.OSIONOS_AI_VLM_MODEL,
	OSIONOS_AI_VLM_REVISION: process.env.OSIONOS_AI_VLM_REVISION,
	OSIONOS_AI_VLM_TIMEOUT_MS: process.env.OSIONOS_AI_VLM_TIMEOUT_MS,
	OSIONOS_AI_VLM_QUEUE_WAIT_MS: process.env.OSIONOS_AI_VLM_QUEUE_WAIT_MS,
	OSIONOS_AI_DESCRIBE_PER_MINUTE: process.env.OSIONOS_AI_DESCRIBE_PER_MINUTE,
};

const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
	// Names only: an environment value can hold the app-session secret.
	const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
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
	return decodePlatformModels(raw) ?? refuse('OSIONOS_AI_PLATFORM_MODELS');
}

/**
 * Whether the service runs in production.
 *
 * The image sets NODE_ENV=production. The development escape hatches of the
 * SSRF guard (the hosts of the tests, the base URLs of the tests) point the
 * API keys of the users at other hosts or open the private addresses of the
 * network: they are for the tests, never for a deployment.
 */
function isProduction(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * The hosts of the development escape hatch of the SSRF guard: the ones that
 * may speak http and may live on a private address.
 *
 * PRODUCTION LEAVES THIS EMPTY. The list exists for the tests, which reach a
 * mock upstream on the loopback; it is never a deployment setting.
 */
function parseDevHosts(raw: string | undefined): readonly string[] {
	if (!raw) return Object.freeze([]);
	if (isProduction()) {
		console.warn(
			'[osionos-ai] ignoring OSIONOS_AI_DEV_ENDPOINT_HOSTS: it is a development escape hatch and this is production',
		);
		return Object.freeze([]);
	}
	return Object.freeze(
		raw
			.split(',')
			.map((host) => host.trim().toLowerCase())
			.filter((host) => host.length > 0),
	);
}

/**
 * The base URLs of the built-in providers, overridden for the tests.
 *
 * A broken JSON is ignored with a warning: the variable is a test
 * convenience, and a typo in it must not stop the service.
 */
function parseDevProviderUrls(raw: string | undefined): Readonly<Record<string, string>> {
	if (!raw) return Object.freeze({});
	if (isProduction()) {
		console.warn(
			'[osionos-ai] ignoring OSIONOS_AI_DEV_PROVIDER_BASE_URLS: it is a development escape hatch and this is production',
		);
		return Object.freeze({});
	}
	try {
		const decoded = JSON.parse(raw) as unknown;
		if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('not an object');
		const urls: Record<string, string> = {};
		for (const [id, url] of Object.entries(decoded as Record<string, unknown>)) {
			if (typeof url === 'string' && url.length > 0) urls[id] = url;
		}
		return Object.freeze(urls);
	} catch {
		console.warn('[osionos-ai] ignoring OSIONOS_AI_DEV_PROVIDER_BASE_URLS: it is not a JSON object of URLs');
		return Object.freeze({});
	}
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
	/** The per-image input-token ceiling added to the reservation of a vision run. */
	visionTokensPerImage: number;
	userDailyMicroUsd: number;
	platformDailyMicroUsd: number;
	runsPerMinute: number;
	/** The window of the related reads: the calls per minute of one user. */
	relatedPerMinute: number;
	/** The window of the device-run sources: the calls per minute of one user. */
	sourcesPerMinute: number;
	/** The base64 of the 32 bytes of the KEK, or nothing when it is not set. */
	kek?: string;
	/** The name of the KEK: the rows carry it, so a rotation is possible. */
	kekId: string;
	/** The hosts of the development escape hatch of the SSRF guard. */
	devEndpointHosts: readonly string[];
	/** The base URLs of the built-in providers, overridden for the tests. */
	devProviderBaseUrls: Readonly<Record<string, string>>;
	/** The URL of the catalog of models.dev. */
	catalogUrl: string;
	/**
	 * The URL of the bridge: where the write tools send their writes.
	 *
	 * It is operator configuration and nothing else: no argument of a tool,
	 * no field of a page and no word of a user can move it. Without it the
	 * write tools are not registered at all.
	 */
	bridgeUrl?: string;
	/** The URL of the internal speech-to-text server, when there is one. */
	sttUrl?: string;
	/** The model the speech-to-text server loads. */
	sttModel: string;
	/** The deadline of one transcription, in milliseconds. */
	sttTimeoutMs: number;
	/** The seconds of audio a user may dictate in a day. */
	sttSecondsPerDay: number;
	/** The image generation is on: without it the route does not exist. */
	imagesEnabled: boolean;
	patEnabled: boolean;
	/** The hosts the MCP endpoint answers to (lower-case, loopback included). */
	mcpAllowedHosts: readonly string[];
	/** The browser origins that may reach the MCP endpoint: none by default. */
	mcpAllowedOrigins: readonly string[];
	/** The OpenAI-compatible base URL of the internal image engine. */
	imageUrl?: string;
	/** The model of the engine, as the provenance of an image names it. */
	imageModel: string;
	/** The price of one image on the ledger, in micro-USD. */
	imageMicroUsd: number;
	/** The images of a user in a UTC day. */
	imagesPerUserDay: number;
	/** The images of the platform in a UTC day. */
	imagesPerDay: number;
	/** The deadline of one generation, in milliseconds. */
	imageTimeoutMs: number;
	/** The directory of the models of the output check (C73). */
	imageCheckDir?: string;
	/** The base URL of the internal prompt guard (L1 of the image gate, C72). */
	promptGuardUrl?: string;
	/** The model the prompt guard is called with. */
	promptGuardModel: string;
	/** The deadline of one call to the prompt guard, in milliseconds. */
	promptGuardTimeoutMs: number;
	/** The base URL of the internal VLM; without it "Describe image" does not exist. */
	vlmUrl?: string;
	vlmModel: string;
	vlmRevision: string;
	vlmTimeoutMs: number;
	vlmQueueWaitMs: number;
	describePerMinute: number;
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
	visionTokensPerImage: parsed.data.OSIONOS_AI_VISION_TOKENS_PER_IMAGE,
	userDailyMicroUsd: parsed.data.OSIONOS_AI_USER_DAILY_MICROUSD,
	platformDailyMicroUsd: parsed.data.OSIONOS_AI_PLATFORM_DAILY_MICROUSD,
	runsPerMinute: parsed.data.OSIONOS_AI_RUNS_PER_MINUTE,
	relatedPerMinute: parsed.data.OSIONOS_AI_RELATED_PER_MINUTE,
	sourcesPerMinute: parsed.data.OSIONOS_AI_SOURCES_PER_MINUTE,
	kek: parsed.data.OSIONOS_AI_KEK,
	kekId: parsed.data.OSIONOS_AI_KEK_ID,
	devEndpointHosts: parseDevHosts(parsed.data.OSIONOS_AI_DEV_ENDPOINT_HOSTS),
	devProviderBaseUrls: parseDevProviderUrls(parsed.data.OSIONOS_AI_DEV_PROVIDER_BASE_URLS),
	catalogUrl: parsed.data.OSIONOS_AI_CATALOG_URL,
	bridgeUrl: parsed.data.OSIONOS_AI_BRIDGE_URL,
	sttUrl: parsed.data.OSIONOS_AI_STT_URL,
	sttModel: parsed.data.OSIONOS_AI_STT_MODEL,
	sttTimeoutMs: parsed.data.OSIONOS_AI_STT_TIMEOUT_MS,
	sttSecondsPerDay: parsed.data.OSIONOS_AI_STT_SECONDS_PER_DAY,
	imagesEnabled: parsed.data.OSIONOS_AI_IMAGES?.trim().toLowerCase() === 'on',
	patEnabled: parsed.data.OSIONOS_AI_PAT?.trim().toLowerCase() === 'on',
	mcpAllowedHosts: Object.freeze(['localhost', '127.0.0.1', ...commaList(parsed.data.OSIONOS_AI_MCP_ALLOWED_HOSTS).map((h) => h.toLowerCase())]),
	mcpAllowedOrigins: Object.freeze(commaList(parsed.data.OSIONOS_AI_MCP_ALLOWED_ORIGINS)),
	imageUrl: parsed.data.OSIONOS_AI_IMAGE_URL,
	imageModel: parsed.data.OSIONOS_AI_IMAGE_MODEL,
	imageMicroUsd: parsed.data.OSIONOS_AI_IMAGE_MICROUSD,
	imagesPerUserDay: parsed.data.OSIONOS_AI_IMAGES_PER_USER_DAY,
	imagesPerDay: parsed.data.OSIONOS_AI_IMAGES_PER_DAY,
	imageTimeoutMs: parsed.data.OSIONOS_AI_IMAGE_TIMEOUT_MS,
	imageCheckDir: parsed.data.OSIONOS_AI_IMAGE_CHECK_DIR,
	promptGuardUrl: parsed.data.OSIONOS_AI_PROMPT_GUARD_URL,
	promptGuardModel: parsed.data.OSIONOS_AI_PROMPT_GUARD_MODEL,
	promptGuardTimeoutMs: parsed.data.OSIONOS_AI_PROMPT_GUARD_TIMEOUT_MS,
	vlmUrl: parsed.data.OSIONOS_AI_VLM_URL?.trim().replace(/\/+$/, '') || undefined,
	vlmModel: parsed.data.OSIONOS_AI_VLM_MODEL,
	vlmRevision: parsed.data.OSIONOS_AI_VLM_REVISION,
	vlmTimeoutMs: parsed.data.OSIONOS_AI_VLM_TIMEOUT_MS,
	vlmQueueWaitMs: parsed.data.OSIONOS_AI_VLM_QUEUE_WAIT_MS,
	describePerMinute: parsed.data.OSIONOS_AI_DESCRIBE_PER_MINUTE,
});

// The image generation, turned on, needs its engine, a price (an image is
// never free on the ledger, C74), the bridge it stores through (C76), the
// models of the output check (C73) and the guard of the prompt (C72): a
// generation that stores whatever the engine said is not a generation the
// product may sell, and a prompt no guard read is not a prompt the product
// may show.
if (config.imagesEnabled) {
	if (!config.imageUrl) refuse('OSIONOS_AI_IMAGE_URL');
	if (config.imageMicroUsd <= 0) refuse('OSIONOS_AI_IMAGE_MICROUSD');
	if (!config.bridgeUrl) refuse('OSIONOS_AI_BRIDGE_URL');
	if (!config.imageCheckDir) refuse('OSIONOS_AI_IMAGE_CHECK_DIR');
	if (!config.promptGuardUrl) refuse('OSIONOS_AI_PROMPT_GUARD_URL');
}

// A deployment that runs the write tools needs the bridge: the URL is
// operator configuration, and a deployment without it has no write path at
// all. The service says so and stops, rather than serving a half of the
// assistant.
if (isProduction() && !parsed.data.OSIONOS_AI_BRIDGE_URL) {
	console.error('[osionos-ai] refusing to start: invalid environment variables: OSIONOS_AI_BRIDGE_URL');
	process.exit(1);
}
