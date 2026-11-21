import { z } from 'zod';

/**
 * The model field of a request. The client sends the literal "auto" for an
 * empty or Auto choice; here it becomes "no model chosen", once, before
 * Auto, the target or any upstream sees it.
 *
 * Caveat: a real upstream model that is itself named "auto" (any case) can no
 * longer be asked for by that name.
 */
export const chosenModel = z
	.string()
	.min(1)
	.optional()
	.transform((model) => (model?.trim().toLowerCase() === 'auto' ? undefined : model));
