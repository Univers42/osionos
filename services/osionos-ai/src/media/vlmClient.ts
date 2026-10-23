import { z } from 'zod';
import { config } from '../config.ts';
import { httpError } from '../http.ts';
import { MAX_TOKENS, PROMPT, SCHEMA } from './vlmPrompt.ts';

/**
 * One call to the internal llama-server, and the check of its answer.
 *
 * The request is the one spikes/a1/vlm-client.py measured: the picture as a
 * base64 data URL in an `image_url` part, temperature 0, the JSON schema as
 * `response_format`. The URL of the server is the deployment's, never a caller's.
 */

const word = z.string().max(40);

/** The answer the schema promises; the server's grammar is not trusted to have held. */
const answerSchema = z
	.object({
		caption: z.string().max(200),
		tags: z.array(word).max(10),
		objects: z.array(word).max(10),
		ocr: z.string().max(300),
		safety: z.enum(['safe', 'suggestive', 'explicit', 'violent', 'unknown']),
	})
	.strict();

/** What is stored: the answer, normalised. `safety` is moderation data and never leaves the service. */
export type StoredAnnotation = z.infer<typeof answerSchema>;

/** Seconds a client should wait after a VLM failure or a busy slot. */
export const RETRY_AFTER_SECONDS = 15;

/** Trimmed, lowercase, without empties and without repeats, in the order the model wrote them. */
export function normaliseWords(words: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const entry of words) {
		const clean = entry.trim().toLowerCase();
		if (clean) seen.add(clean);
	}
	return [...seen];
}

/** The answer's content as a checked annotation, or a 502 `vlm_bad_answer`. */
export function parseAnswer(content: unknown): StoredAnnotation {
	let json: unknown;
	try {
		json = JSON.parse(String(content));
	} catch {
		throw httpError(502, 'vlm_bad_answer');
	}
	const checked = answerSchema.safeParse(json);
	if (!checked.success) throw httpError(502, 'vlm_bad_answer');
	return {
		...checked.data,
		caption: checked.data.caption.trim(),
		tags: normaliseWords(checked.data.tags),
		objects: normaliseWords(checked.data.objects),
		ocr: checked.data.ocr.trim(),
	};
}

/** Asks the VLM about one picture (already stripped). */
export async function askVlm(image: Uint8Array, format: string): Promise<StoredAnnotation> {
	const dataUrl = `data:image/${format};base64,${Buffer.from(image).toString('base64')}`;
	let payload: { choices?: { message?: { content?: unknown } }[] };
	try {
		const response = await fetch(`${config.vlmUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				model: config.vlmModel,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: PROMPT },
							{ type: 'image_url', image_url: { url: dataUrl } },
						],
					},
				],
				temperature: 0,
				max_tokens: MAX_TOKENS,
				stream: false,
				response_format: { type: 'json_schema', json_schema: SCHEMA },
			}),
			redirect: 'manual',
			signal: AbortSignal.timeout(config.vlmTimeoutMs),
		});
		if (!response.ok) throw new Error(`vlm status ${response.status}`);
		payload = (await response.json()) as typeof payload;
	} catch {
		throw Object.assign(httpError(503, 'vlm_unavailable'), { retryAfterSeconds: RETRY_AFTER_SECONDS });
	}
	return parseAnswer(payload.choices?.[0]?.message?.content);
}
