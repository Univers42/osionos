import { z } from 'zod';

/**
 * The shape of the catalog of models.dev, and the way it is read.
 *
 * The catalog is third-party data, so it is read permissively: a provider that
 * does not fit the shape is skipped, and so is a model. A broken entry never
 * stops the catalog.
 */

/** A model of the catalog, as the client sees it. */
export interface CatalogModel {
	id: string;
	label: string;
	contextWindow?: number;
	inputMicroUsdPerMTok?: number;
	outputMicroUsdPerMTok?: number;
}

/** A provider of the catalog, as the server keeps it. */
export interface CatalogProvider {
	id: string;
	name: string;
	doc?: string;
	api?: string;
	npm?: string;
	models: CatalogModel[];
}

/** The cap of the models kept for one provider. */
export const MAX_MODELS = 2_000;

/**
 * The shape of a model of the catalog.
 *
 * Everything is optional but the name and the id: a model the catalog does not
 * describe well is skipped, never fatal.
 */
const modelSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	limit: z.object({ context: z.number().int().nonnegative().optional() }).optional(),
	cost: z
		.object({
			input: z.number().nonnegative().optional(),
			output: z.number().nonnegative().optional(),
		})
		.optional(),
});

/** The shape of a provider of the catalog. */
const providerSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	doc: z.string().min(1).optional(),
	api: z.string().min(1).optional(),
	npm: z.string().min(1).optional(),
	models: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One model of the catalog.
 *
 * The prices of models.dev are in dollars per million tokens; the service
 * counts in micro-dollars, so they are scaled by a million. A model without a
 * price carries no price: the catalog does not know it.
 */
function toModel(raw: unknown): CatalogModel | null {
	const parsed = modelSchema.safeParse(raw);
	if (!parsed.success) return null;
	const model = parsed.data;
	const context = model.limit?.context;
	const input = model.cost?.input;
	const output = model.cost?.output;
	return {
		id: model.id,
		label: model.name,
		...(context === undefined ? {} : { contextWindow: context }),
		...(input === undefined ? {} : { inputMicroUsdPerMTok: Math.round(input * 1e6) }),
		...(output === undefined ? {} : { outputMicroUsdPerMTok: Math.round(output * 1e6) }),
	};
}

/** One provider of the catalog, with its models. */
export function toProvider(raw: unknown): CatalogProvider | null {
	const parsed = providerSchema.safeParse(raw);
	if (!parsed.success) return null;
	const provider = parsed.data;
	const models: CatalogModel[] = [];
	for (const value of Object.values(provider.models ?? {})) {
		const model = toModel(value);
		if (model) models.push(model);
	}
	return {
		id: provider.id,
		name: provider.name,
		...(provider.doc ? { doc: provider.doc } : {}),
		...(provider.api ? { api: provider.api } : {}),
		...(provider.npm ? { npm: provider.npm } : {}),
		models: models.slice(0, MAX_MODELS),
	};
}

/**
 * The catalog, parsed.
 *
 * A provider that does not fit the shape is skipped, and so is a model that
 * does not: a broken entry never stops the catalog.
 */
export function parseCatalog(payload: unknown): CatalogProvider[] {
	const top = z.record(z.string(), z.unknown()).safeParse(payload);
	if (!top.success) return [];
	const found: CatalogProvider[] = [];
	for (const raw of Object.values(top.data)) {
		const provider = toProvider(raw);
		if (provider) found.push(provider);
	}
	return found;
}
