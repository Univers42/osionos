/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-issue-redact.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Redaction for issue reports: strip the shapes a secret most often takes before
 * a report is stored. Pure: no imports, no side effects.
 *
 * Caveat: this misses a secret that carries none of these shapes (a bare API
 * key with no `key=`/`token=` around it, a password in free prose), and it
 * over-redacts a harmless `code=` query parameter (every `code=` value becomes
 * `[redacted]`, including OAuth codes the user pasted on purpose). It is a
 * best-effort scrub, not a secret scanner; the reporter is still told not to
 * paste credentials.
 */
export function redactIssueText(text) {
	let out = String(text ?? '');
	// 1. JWT-looking tokens.
	out = out.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]');
	// 2. Bearer tokens.
	out = out.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');
	// 3. Sensitive query-string values.
	out = out.replace(/(token|key|apikey|access_token|secret|password|code)=([^&#\s]+)/gi, '$1=[redacted]');
	// 4. Email addresses.
	out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
	return out;
}
