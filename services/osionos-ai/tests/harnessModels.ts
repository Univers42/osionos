/**
 * The platform models of the harness and the daily budget they are priced
 * against, split from harness.ts to keep it under the file-size cap.
 */

/** The metered model: twenty micro-USD a thousand tokens. */
export const METERED = {
	id: 'mock-metered',
	label: 'Mock metered',
	inputMicroUsdPerMTok: 20_000,
	outputMicroUsdPerMTok: 20_000,
	default: false,
	dataUse: 'no-train' as const,
};

/**
 * The platform model: three dollars a million tokens in, fifteen out.
 *
 * It is the price of a real model, and the price the cap of the day is made
 * for: the output of a step is the expensive part of it, and a five-step
 * loop costs more than the cap of a user holds.
 */
export const PLATFORM = {
	id: 'mock-platform',
	label: 'Mock platform',
	inputMicroUsdPerMTok: 3_000_000,
	outputMicroUsdPerMTok: 15_000_000,
	default: false,
	dataUse: 'no-train' as const,
};

/** The dear model: one call of it costs more than the daily limit of a user. */
export const DEAR = {
	id: 'mock-dear',
	label: 'Mock dear',
	inputMicroUsdPerMTok: 200_000_000,
	outputMicroUsdPerMTok: 200_000_000,
	default: false,
	dataUse: 'no-train' as const,
};

/**
 * The daily budget of a user, in micro-USD.
 *
 * It is the one of the deployment: the reservation of a run is two step
 * ceilings, and the steps after that ask the ledger for what they need, one
 * extension at a time.
 */
export const USER_DAILY_MICROUSD = 200_000;

/** Two routes on OpenRouter's free tier: the ids are what marks them. */
export const FREE_TIER_FIRST = { id: 'mock/first:free', label: 'Free first', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false, dataUse: 'no-train' as const };
export const FREE_TIER_SECOND = { id: 'mock/second:free', label: 'Free second', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false, dataUse: 'no-train' as const };

/** The free model: the runs of the other cases are not bounded by the budget. */
export const FREE = {
	id: 'mock-model',
	label: 'Mock model',
	inputMicroUsdPerMTok: 0,
	outputMicroUsdPerMTok: 0,
	default: true,
	dataUse: 'no-train' as const,
};

/**
 * The vision model: it sees the images the user attaches.
 *
 * Its price is one dollar a million tokens, so the reservation of a run with
 * four images is a number a test can read: four images of sixteen hundred
 * tokens are 6 400 micro-USD.
 */
export const VISION = {
	id: 'mock-vision',
	label: 'Mock vision',
	input: ['text', 'image'],
	inputMicroUsdPerMTok: 1_000_000,
	outputMicroUsdPerMTok: 1_000_000,
	default: false,
	dataUse: 'no-train' as const,
};

/** A model that reasons: a run may ask it for an effort. */
export const REASONER = {
	id: 'mock-reasoner',
	label: 'Mock reasoner',
	inputMicroUsdPerMTok: 0,
	outputMicroUsdPerMTok: 0,
	default: false,
	reasoning: true,
	dataUse: 'no-train' as const,
};
