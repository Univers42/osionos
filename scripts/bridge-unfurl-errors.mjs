/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-errors.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The fixed set of failures the unfurler can report. A message per kind keeps upstream
 * status codes and errno text away from the caller (and so from a user probing the net).
 */

import { httpError } from './bridge-social-core.mjs';

const ERRORS = Object.freeze({
	invalid: ['A valid http(s) URL is required.', 422],
	credentials: ['URLs with credentials are not allowed.', 422],
	blocked: ['This address is not allowed.', 422],
	unreachable: ['Could not fetch the link.', 502],
	redirects: ['The link redirects too many times.', 502],
	timeout: ['The link took too long to respond.', 504],
	busy: ['Too many link lookups are running. Retry shortly.', 503],
});

/** Error with a fixed message per kind: upstream status and errno never reach the caller. */
export function unfurlError(kind) {
	const [message, status] = ERRORS[kind];
	return Object.assign(httpError(message, status), { unfurlKind: kind });
}

