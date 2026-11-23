/**
 * What an error answer may say. A route's message can quote upstream text (PostgREST names
 * the table, column or constraint that failed), and the routes copy `error.message` into
 * their bodies through a dozen helpers, so every answer written through writeJsonResponse
 * holds a 5xx message to a fixed sentence and logs the original. The rtc, runner, IDE
 * sandbox and agent writers end their own response and call publicAnswerBody themselves; the
 * agent and Claude SSE streams send publicErrorFrame. The connector, oauth, perms and
 * ide-http-edge writers and the runner's own SSE frames only ever send fixed sentences on a
 * 5xx; every 4xx answer keeps its words. A bridge-authored 5xx sentence keeps its words only
 * when declared through publicSentence: the opt-in is by exact text, so no upstream message
 * can ever match one.
 */
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-error-sentences.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const FIXED_MESSAGES = new Map([
	[400, 'The request was not accepted.'],
	[401, 'Not authorized.'],
	[403, 'Not allowed.'],
	[404, 'Not found.'],
	[409, 'The page changed; reload and retry.'],
	[422, 'The request body was not valid.'],
	[429, 'Too many requests.'],
]);

export const fixedMessage = (status) => FIXED_MESSAGES.get(status) ?? (status >= 500 ? 'The service is unavailable; try again.' : 'The request failed.');

const PUBLIC_SENTENCES = new Set();

/** Declares a bridge-authored sentence that a 5xx answer may carry as is. */
export function publicSentence(text) {
	PUBLIC_SENTENCES.add(text);
	return text;
}

// Caveat: the log mask is a pattern. It hides the credentials of a `scheme://…@` URL whole
// and a `user@host` pair (an email), but not a bare token, a signed URL's query string, or
// the row values PostgREST quotes in `details` — those reach the server log as written.
const SECRET_SHAPES = /(\w+:\/\/)[^\s@]*@|[^\s"'@/]+@[^\s"'@:/]+/g;
// The mask is quadratic on a long text with no `@` (944 ms at 50 kB), and a CR/LF would
// split one answer across log lines, so the text is capped and flattened first.
const LOG_CHARS = 500;

/** Logs what an upstream said behind a 5xx answer, as one capped, masked line. */
export function logUpstream(status, text) {
	const line = String(text).slice(0, LOG_CHARS).replace(/[\r\n]+/g, ' ')
		.replace(SECRET_SHAPES, (_found, scheme) => (scheme ? `${scheme}[redacted]@` : '[redacted]'));
	console.error(`bridge: ${status} answer: ${line}`);
}

/** The body a client may read: a status under 500 is returned as the same object. */
export function publicAnswerBody(status, body) {
	if (status < 500 || body === null || typeof body !== 'object' || typeof body.message !== 'string') return body;
	if (PUBLIC_SENTENCES.has(body.message)) return body;
	const sentence = fixedMessage(status);
	if (body.message !== sentence) logUpstream(status, body.message);
	return { ...body, message: sentence };
}

/** The `error` frame a stream may send for a caught error; one without a status is a 500. */
export function publicErrorFrame(error) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const message = typeof error?.message === 'string' ? error.message : fixedMessage(status);
	return publicAnswerBody(status, { message });
}
