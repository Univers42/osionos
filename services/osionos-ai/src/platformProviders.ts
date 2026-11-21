import { isIP } from 'node:net';
import { z } from 'zod';
import { isBlockedAddress } from './connections/blockedAddress.ts';
import { type DataUse, type PlatformModelEntry, dataUseSchema, platformModelSchema } from './platformModels.ts';

export type { DataUse };
export type Wire = 'openrouter' | 'openai-compatible';

/** A model of a pooled provider: the legacy entry plus the id the upstream knows it by. */
export interface PoolModel extends PlatformModelEntry {
	upstreamId: string;
	dataUse: DataUse;
	rank?: number;
}

export interface PlatformProvider {
	id: string;
	baseUrl: string;
	apiKeyEnv?: string;
	wire: Wire;
	models: PoolModel[];
}

const poolModelSchema = platformModelSchema.extend({
	upstreamId: z.string().min(1),
	dataUse: dataUseSchema.default('may-train'),
	rank: z.number().int().nonnegative().optional(),
});

/** Only OSIONOS_AI_KEY_* names: a provider must never be pointed at the KEK or the database URL (FA3). */
const providerSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]{1,32}$/),
	baseUrl: z.string().min(1),
	apiKeyEnv: z.string().regex(/^OSIONOS_AI_KEY_[A-Z0-9_]+$/).optional(),
	wire: z.enum(['openrouter', 'openai-compatible']),
	models: z.array(poolModelSchema).min(1),
});

const providersSchema = z.array(providerSchema).superRefine((providers, ctx) => {
	if (new Set(providers.map((provider) => provider.id)).size !== providers.length) {
		ctx.addIssue({ code: 'custom', message: 'provider ids must be unique' });
	}
});

/** https always; http only for a dev host on the allowlist, so no prompt travels in clear to a stranger (FA4). */
function isAllowedBaseUrl(baseUrl: string, devHosts: readonly string[]): boolean {
	try {
		const url = new URL(baseUrl);
		return url.protocol === 'https:' || (url.protocol === 'http:' && devHosts.includes(url.hostname));
	} catch {
		return false;
	}
}

/** The provider id buildCatalog gives the legacy list's own entries (S LOW 3). */
const RESERVED_ID = 'legacy';

/**
 * Whether a baseUrl's host is internal: a single label (a compose service
 * name), localhost, or an IP literal in a blocked range (FC7).
 *
 * Caveat: it reads the host as written, with one trailing dot (the DNS root)
 * dropped. A DNS name that resolves to a private address (an internal zone, a
 * public name pointed at 10.x, nip.io) still passes, and it over-drops any
 * blocked literal (CGNAT 100.64/10, the documentation ranges); the
 * deployment's network policy is the boundary for names, and an operator
 * names a public provider by its public DNS name.
 */
function isInternalHost(baseUrl: string): boolean {
	const written = new URL(baseUrl).hostname.toLowerCase().replace(/\.$/, '');
	const host = written.startsWith('[') ? written.slice(1, -1) : written;
	if (isIP(host) !== 0) return isBlockedAddress(host);
	return host === 'localhost' || host.endsWith('.localhost') || !host.includes('.');
}

/** Why a valid provider is still dropped, or null when it is kept. */
function dropReason(provider: { id: string; baseUrl: string }, publicMode: boolean): string | null {
	if (provider.id === RESERVED_ID) return 'its id is reserved';
	if (publicMode && isInternalHost(provider.baseUrl)) return 'its baseUrl host is internal in public mode';
	return null;
}

function toPoolModel(model: z.infer<typeof poolModelSchema>): PoolModel {
	return {
		...model,
		default: model.default === true,
		vision: Array.isArray(model.input) && model.input.includes('image'),
		reasoning: model.reasoning === true,
	};
}

/**
 * The pooled providers decoded from OSIONOS_AI_PLATFORM_PROVIDERS: `[]` when the
 * value is unset (no pool), `null` when it is broken so the caller refuses to boot
 * rather than run a half-trusted pool. A valid provider that takes the reserved
 * id, or an internal host in public mode, is dropped with a log line instead.
 */
export function decodePlatformProviders(
	raw: string | undefined,
	opts: { devHosts: readonly string[]; publicMode?: boolean; log?: (line: string) => void },
): PlatformProvider[] | null {
	if (raw === undefined || raw.trim() === '') return [];
	let decoded: unknown;
	try {
		decoded = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = providersSchema.safeParse(decoded);
	if (!result.success) return null;
	if (!result.data.every((provider) => isAllowedBaseUrl(provider.baseUrl, opts.devHosts))) return null;
	// The log names the id only: the URL and the key variable stay out (FA6).
	const kept = result.data.filter((provider) => {
		const reason = dropReason(provider, opts.publicMode === true);
		if (reason) opts.log?.(`[osionos-ai] provider ${provider.id} dropped: ${reason}`);
		return reason === null;
	});
	return kept.map((provider) => ({ ...provider, models: provider.models.map(toPoolModel) }));
}
