import { checkText as bridgeCheckText } from '../../../../scripts/bridge-moderation.mjs';
import { config } from '../config.ts';

/**
 * The prompt gate of the images (devil C72): L0 (the rules) and L1 (the
 * guard), synchronous, before anything runs.
 *
 * L0 is the bridge's own check — `scripts/bridge-moderation.mjs`, REUSED and
 * not copied: the same lists, the same rules, the same codes. The surface is
 * `publish`, the one of a text the world reads. The matched terms are never
 * logged and never returned (C94): the answer is the codes.
 *
 * L1 is the guard of A1 (Qwen3Guard-Gen-0.6B on llama-server), called over
 * the OpenAI-compatible wire the spike measured, with the body the spike sent
 * (`spikes/a1/guard-client.py`, `ask`). A guard that is down, that answers
 * garbage or that is too slow makes the call throw, and the route answers 503
 * `moderation_unavailable`: nothing is called and nothing is charged (C72:
 * fail closed).
 *
 * Caveat: the measured strict recall on I2P is a LOWER bound of ~36 % (I2P
 * labels images, not prompts), the strict FPR on COCO captions is 6.3 % before
 * the T/C carve-out, obfuscation and fr/es are unmeasured (the 4B and the
 * language runs never finished), and L0 is a blocklist (leetspeak evades it).
 */

/** The codes of L0 that refuse a prompt. The terms are never in the answer. */
const REFUSING_CODES: ReadonlySet<string> = new Set(['blocklist', 'pii']);

/**
 * The bridge's L0, as this service calls it.
 *
 * The module is JavaScript, and the type it infers for `checkText` does not
 * name the surface of the call (the binding is read, never written): the one
 * call this service makes of it is typed here, once.
 */
const checkText = bridgeCheckText as unknown as (
	text: string,
	options: { surface: string },
) => { reasons: { code: string }[] };

/**
 * The codes of L0 that refuse the prompt: `blocklist` and `pii`.
 *
 * The other codes of L0 (`links`, `repeat`) are the rules of the spam of the
 * bridge, not refusals of a prompt.
 */
export function l0Codes(prompt: string): string[] {
	const { reasons } = checkText(prompt, { surface: 'publish' });
	return reasons.map((reason) => reason.code).filter((code) => REFUSING_CODES.has(code));
}

/** Whether the rules of the bridge refuse the prompt. */
export function l0Refuses(prompt: string): boolean {
	return l0Codes(prompt).length > 0;
}

/** The failure of the guard: the code the route answers, and nothing else. */
function unavailable(): Error {
	return Object.assign(new Error('moderation_unavailable'), { code: 'moderation_unavailable' });
}

/**
 * The answer of the guard, or a failure.
 *
 * The body is exactly the one of the spike: the model, ONE user message
 * (the prompt), no temperature, 32 tokens, no stream. The deadline is the
 * timeout of the configuration (8 s: A1's p95 with four clients was 5389 ms),
 * and the caller's signal may cut it short.
 */
export async function askGuard(prompt: string, signal: AbortSignal): Promise<string> {
	const body = {
		model: config.promptGuardModel,
		messages: [{ role: 'user', content: prompt }],
		temperature: 0,
		max_tokens: 32,
		stream: false,
	};
	let response: Response;
	try {
		response = await fetch(`${config.promptGuardUrl ?? ''}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.any([signal, AbortSignal.timeout(config.promptGuardTimeoutMs)]),
		});
	} catch {
		throw unavailable();
	}
	if (!response.ok) throw unavailable();
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw unavailable();
	}
	const content = (payload as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw unavailable();
	return content;
}
