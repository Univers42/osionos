import { z } from 'zod';

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
	/** The modalities the model accepts as input. Defaults to ["text"]. */
	input?: string[];
	inputMicroUsdPerMTok: number;
	outputMicroUsdPerMTok: number;
	default: boolean;
	/** Whether the model accepts image input: `input` contains "image". */
	vision?: boolean;
	/** Whether the model reasons, so a run may ask for an effort. Absent is false. */
	reasoning?: boolean;
	/** Whether the upstream may train on prompts. Absent on a legacy entry: the pool applies may-train. */
	dataUse?: DataUse;
}

/** What the upstream does with prompts; the pool defaults to the cautious may-train. */
export type DataUse = 'no-train' | 'may-train';
export const dataUseSchema = z.enum(['no-train', 'may-train']);

export const platformModelSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	input: z.array(z.string().min(1)).optional(),
	inputMicroUsdPerMTok: z.number().int().nonnegative(),
	outputMicroUsdPerMTok: z.number().int().nonnegative(),
	default: z.boolean().optional(),
	reasoning: z.boolean().optional(),
	dataUse: dataUseSchema.optional(),
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

/**
 * The allowlist decoded from its JSON, or `null` when the JSON or its shape is
 * broken. A model is `vision` when its input list holds "image".
 */
export function decodePlatformModels(raw: string): PlatformModelEntry[] | null {
	let decoded: unknown;
	try {
		decoded = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = platformModelsSchema.safeParse(decoded);
	if (!result.success) return null;
	return result.data.map((model) => ({
		...model,
		default: model.default === true,
		vision: Array.isArray(model.input) && model.input.includes('image'),
		reasoning: model.reasoning === true,
	}));
}
