/* ************************************************************************** */
/*                                                                            */
/*   llm.ts                                  the query translation of the LLM */
/*                                                                            */
/*   Variant C of the multilingual experiment: a small local llama.cpp server */
/*   rewrites the question in English and in French, so the retrieval can run */
/*   its lexical half in the language of the page it looks for.              */
/*                                                                            */
/*   The model is the one of the deployment (the volume osionos_ai_models_llm, */
/*   read-only), the server is a throwaway container of the eval network, and */
/*   nothing leaves the machine.                                              */
/*                                                                            */
/*   The latency of the call is measured on its own: it is the price of the  */
/*   variant, and it never hides inside the latency of the retrieval.        */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { performance } from 'node:perf_hooks';

/** The two rewrites of a question, and the milliseconds they took. */
export interface Translation {
	/** The question, in English. */
	english: string;
	/** The question, in French. */
	french: string;
	/** The milliseconds the call took. */
	ms: number;
}

/** How long a call may take before it is a failure. */
const CALL_TIMEOUT_MS = 120_000;

/** The system prompt: two rewrites, and nothing else. */
const SYSTEM_PROMPT = [
	'You rewrite a question for a search engine.',
	'Answer with a JSON array of exactly two strings: the question in English, then the question in French.',
	'Keep the meaning, the names, the numbers and the codes exactly as they are.',
	'Answer with the array only: no explanation, no markdown, no code fence.',
].join(' ');

/** The client of the local llama.cpp server. */
export class Translator {
	private readonly baseUrl: string;
	private readonly model: string;

	constructor(options: { baseUrl: string; model: string }) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.model = options.model;
	}

	/** The rewrites of one question. */
	async translate(question: string): Promise<Translation> {
		const started = performance.now();
		const answer = await this.ask(question);
		const ms = performance.now() - started;
		const [english, french] = parseRewrites(answer);
		return { english, french, ms };
	}

	/** The call itself: one chat completion, temperature zero. */
	private async ask(question: string): Promise<string> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					model: this.model,
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{ role: 'user', content: question },
					],
					temperature: 0,
					max_tokens: 400,
					// Qwen3 thinks by default; the thinking block would eat the
					// answer and slow the call down.
					chat_template_kwargs: { enable_thinking: false },
				}),
				signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
			});
		} catch {
			throw new Error('llm_unreachable');
		}
		if (!response.ok) throw new Error(`llm_http_${response.status}`);
		const payload = (await response.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		const content = payload.choices?.[0]?.message?.content;
		if (typeof content !== 'string') throw new Error('llm_bad_answer');
		return content;
	}
}

/**
 * The two rewrites of the answer of the model.
 *
 * The model is asked for a JSON array, but a model is a model: the array is
 * found in the text and parsed. A fenced array is read as an array.
 */
export function parseRewrites(answer: string): [string, string] {
	const start = answer.indexOf('[');
	const end = answer.lastIndexOf(']');
	if (start === -1 || end <= start) throw new Error('llm_no_array');
	let parsed: unknown;
	try {
		parsed = JSON.parse(answer.slice(start, end + 1));
	} catch {
		throw new Error('llm_bad_json');
	}
	if (!Array.isArray(parsed) || parsed.length < 2) throw new Error('llm_bad_array');
	const english = String(parsed[0] ?? '').trim();
	const french = String(parsed[1] ?? '').trim();
	if (english.length === 0 || french.length === 0) throw new Error('llm_empty_rewrite');
	return [english, french];
}
