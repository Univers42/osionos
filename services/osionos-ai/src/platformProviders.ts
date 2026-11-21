import { z } from 'zod';
import { type DataUse, type PlatformModelEntry, dataUseSchema } from './platformModels.ts';

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

const poolModelSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	input: z.array(z.string().min(1)).optional(),
	inputMicroUsdPerMTok: z.number().int().nonnegative(),
	outputMicroUsdPerMTok: z.number().int().nonnegative(),
	default: z.boolean().optional(),
	reasoning: z.boolean().optional(),
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
 * rather than run a half-trusted pool.
 */
export function decodePlatformProviders(
	raw: string | undefined,
	opts: { devHosts: readonly string[] },
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
	return result.data.map((provider) => ({ ...provider, models: provider.models.map(toPoolModel) }));
}
