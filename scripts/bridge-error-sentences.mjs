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

/**
 * What an error answer may say. A route's message can quote upstream text (PostgREST names
 * the table, column or constraint that failed), and the routes copy `error.message` into
 * their bodies through a dozen helpers, so the one place every JSON answer passes, the
 * writer, holds a 5xx message to a fixed sentence and logs the original. A bridge-authored
 * 5xx sentence keeps its words only when declared through publicSentence: the opt-in is by
 * exact text, so no upstream message can ever match one.
 */

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

// Caveat: the log mask is a pattern. It hides a `user@host` pair (an email, a DSN's
// credentials) but not a bare token or password the message quotes without an `@`.
const USER_AT_HOST = /[^\s"'@/]+@[^\s"'@:/]+/g;

/** The body a client may read: a status under 500 is returned as the same object. */
export function publicAnswerBody(status, body) {
	if (status < 500 || body === null || typeof body !== 'object' || typeof body.message !== 'string') return body;
	if (PUBLIC_SENTENCES.has(body.message)) return body;
	const sentence = fixedMessage(status);
	if (body.message !== sentence) console.error(`bridge: ${status} answer: ${body.message.replaceAll(USER_AT_HOST, '[redacted]')}`);
	return { ...body, message: sentence };
}
