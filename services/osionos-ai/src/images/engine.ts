import { randomInt } from 'node:crypto';
import { generateImage } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { config } from '../config.ts';

/**
 * The image engine: stable-diffusion.cpp's sd-server, through the AI SDK's
 * OpenAI-compatible image model — the one path A1 proved on the wire (devil
 * C71; `spikes/a1/results/imagegen/RESULTS.md`).
 *
 * sd-server reads its seed only from an `<sd_cpp_extra_args>` tag in the
 * prompt (A1 finding 2). The route refuses a prompt that carries one, so the
 * tag added here is the only one, and it holds the seed and nothing else. No
 * image is ever passed: `files` would send the call to /images/edits (C72).
 */

export const ENGINE_TAG = 'sd_cpp_extra_args';
/** The one size A1 measured. */
export const IMAGE_SIZE = '512x512';

/** The codes of a connection that never opened: the engine did no work. */
const UNREACHABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

/**
 * Whether a failure of the engine happened before it received the call: the
 * AI SDK wraps a refused connection in an APICallError whose cause carries
 * the code. A reset in the middle of a call is NOT one of these: the engine
 * may have worked, and the image is booked.
 */
export function neverConnected(error: unknown): boolean {
	const cause = (error as { cause?: { code?: unknown; errors?: unknown } } | null)?.cause;
	// A name with several addresses fails with one error per address.
	const attempts = Array.isArray(cause?.errors) ? (cause.errors as { code?: unknown }[]) : [cause];
	return attempts.length > 0 && attempts.every((attempt) => typeof attempt?.code === 'string' && UNREACHABLE.has(attempt.code));
}

/** The prompt the engine receives: the user's, then the server's seed. */
export function enginePrompt(prompt: string, seed: number): string {
	return `${prompt} <${ENGINE_TAG}>${JSON.stringify({ seed })}</${ENGINE_TAG}>`;
}

/**
 * One image of a prompt. A fresh random seed per call: without one, every
 * repeat of a prompt is the same bytes (A1, calls 1 and 4).
 */
export async function generateOnEngine(prompt: string, signal: AbortSignal): Promise<Uint8Array> {
	const provider = createOpenAICompatible({ name: 'osionos-image', baseURL: config.imageUrl ?? '' });
	let result: Awaited<ReturnType<typeof generateImage>>;
	try {
		result = await generateImage({
			model: provider.imageModel(config.imageModel),
			prompt: enginePrompt(prompt, randomInt(0, 2 ** 31 - 1)),
			size: IMAGE_SIZE,
			n: 1,
			// A retry is a second generation on a busy GPU: the run fails instead.
			maxRetries: 0,
			abortSignal: signal,
		});
	} catch (error) {
		if (neverConnected(error)) {
			throw Object.assign(new Error('engine_unavailable'), { code: 'engine_unavailable' });
		}
		throw error;
	}
	const image = result.images[0];
	if (!image) throw Object.assign(new Error('engine_failed'), { code: 'engine_failed' });
	return image.uint8Array;
}
