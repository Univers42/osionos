/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-ytext-preflight.mjs                          :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Guard: COLLAB_YTEXT=1 requires the `version` column on `osionos_pages` to be readable.
 * Verdict S1: Y.Text merges are only safe with strict page versions, which need the version column.
 * Caveat: this probe proves the column is readable at boot only — a column dropped later is not caught.
 */

/**
 * Boot gate for COLLAB_YTEXT=1 (verdict S1): strict page versions are what keep Y.Text
 * merges safe, and they only work while `osionos_pages.version` is readable, so the
 * bridge refuses to start until one service-role read of the column succeeds.
 *
 * @param {{ COLLAB_YTEXT?: string }} env the environment the flag is read from
 * @param {{ baasUrl?: string, serviceKey?: string }} config the service-role BaaS access
 * @param {typeof fetch} [fetchImpl] the transport the one probe goes through
 * @param {number} [timeoutMs] the deadline of the probe
 * @returns {Promise<{ checked: boolean }>} whether the flag was on and the probe ran
 * @throws {Error} `COLLAB_YTEXT=1 refused: …` — the reason only, never the host or the key
 */
export async function checkYtextPreconditions({ env, config, fetchImpl = fetch, timeoutMs = 5000 }) {
	if (env.COLLAB_YTEXT !== '1') return { checked: false };

	// One refusal message; the reason alone — the host and the service key never reach a log.
	const refused = (reason) => new Error(`COLLAB_YTEXT=1 refused: osionos_pages.version is not readable (${reason})`);
	if (!config.baasUrl || !config.serviceKey) throw refused('baas not configured');

	const url = `${config.baasUrl}/rest/v1/osionos_pages?select=version&limit=0`;
	let response;
	try {
		response = await fetchImpl(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				apikey: config.serviceKey,
				Authorization: `Bearer ${config.serviceKey}`,
			},
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		throw refused(error?.name || 'Error');
	}
	if (!response.ok) throw refused(`HTTP ${response.status}`);
	return { checked: true };
}
