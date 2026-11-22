/**
 * The assistant modes' switches (AM18, G7): one flag, a per-user allowlist and
 * the auto-mode caps. Parsed here so config.ts only spreads the result.
 *
 * Caveat: the allowlist is read once at boot; adding a user needs a restart.
 * A caps variable that is set but empty reads as unset (the default), because
 * compose passes `${VAR:-}` as "" -- an empty string is never a zero cap.
 */
export interface ModesConfig {
	modesEnabled: boolean;
	modesUsers: ReadonlySet<string>;
	autoPerTurn: number;
	autoPerDay: number;
	autoPerMinute: number;
	autoPerStep: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAP_MAX = 100_000;

function parseUsers(raw: string | undefined): ReadonlySet<string> {
	const users = new Set<string>();
	for (const part of (raw ?? '').split(',')) {
		const id = part.trim();
		if (id === '') continue;
		if (!UUID.test(id)) throw new Error(`OSIONOS_AI_MODES_USERS: "${id}" is not a uuid`);
		users.add(id.toLowerCase());
	}
	return users;
}

function parseCap(env: NodeJS.ProcessEnv, name: string, fallback: number, max: number): number {
	const raw = env[name]?.trim();
	if (raw === undefined || raw === '') return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1 || value > max) {
		throw new Error(`${name} must be an integer from 1 to ${max}, got "${raw}"`);
	}
	return value;
}

export function parseModesConfig(env: NodeJS.ProcessEnv): ModesConfig {
	return {
		modesEnabled: env.OSIONOS_AI_MODES === 'on',
		modesUsers: parseUsers(env.OSIONOS_AI_MODES_USERS),
		autoPerTurn: parseCap(env, 'OSIONOS_AI_AUTO_PER_TURN', 25, 100),
		autoPerDay: parseCap(env, 'OSIONOS_AI_AUTO_PER_DAY', 200, CAP_MAX),
		autoPerMinute: parseCap(env, 'OSIONOS_AI_AUTO_PER_MINUTE', 30, CAP_MAX),
		autoPerStep: parseCap(env, 'OSIONOS_AI_AUTO_PER_STEP', 10, CAP_MAX),
	};
}

export function modesAllowed(cfg: ModesConfig, userId: string): boolean {
	return cfg.modesEnabled && cfg.modesUsers.has(userId.toLowerCase());
}
