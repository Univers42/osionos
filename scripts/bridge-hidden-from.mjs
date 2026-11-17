/**
 * The one rule for "may this viewer see this person": a subject is hidden from a viewer
 * when it is not the viewer and either opted out of the directory or a block lies between
 * them in either direction. The profile, the account card, the follow counts and the follow
 * lists all ask here, so the rule cannot drift between routes.
 *
 * It fails closed: a lookup that errors is not "visible". The caller gets a 503 and no
 * data, because answering from a half-read rule would hand out what a block hides.
 *
 * Caveat: the opt-out is read from osionos_profiles. A user who has an identity row but no
 * profile row (the backfill skips users without a GoTrue row) can never be seen as opted
 * out here, so that user is shown; a missing row is also how an unknown id answers, which
 * is why it cannot be treated as hidden.
 */

import { UUID_REGEX, blockedViewerBy, readInChunks, rest } from './bridge-social-core.mjs';
import { inFilter } from './bridge-paging.mjs';

const lower = (id) => String(id ?? '').toLowerCase();

async function optedOutAmong(config, fetchImpl, ids) {
	const rows = await readInChunks(ids, async (chunk) => {
		const part = await rest(config, fetchImpl, `osionos_profiles?${inFilter('user_id', chunk)}&directory_opt_out=eq.true&select=user_id`);
		return Array.isArray(part) ? part : [];
	});
	return new Set(rows.map((row) => lower(row.user_id)));
}

function unavailable(cause) {
	return Object.assign(new Error('The account plane is unavailable.', { cause }), { status: 503, code: 'account_plane_unavailable' });
}

/** The subset of `subjectIds` hidden from `viewerId`, as lower-case ids; two reads, whatever the size. */
export async function hiddenAmong(config, fetchImpl, viewerId, subjectIds) {
	const viewer = lower(viewerId);
	const others = [...new Set(subjectIds.map(lower))].filter((id) => id !== viewer && UUID_REGEX.test(id));
	if (others.length === 0) return new Set();
	try {
		const [blocked, optedOut] = await Promise.all([
			blockedViewerBy(config, fetchImpl, viewer),
			optedOutAmong(config, fetchImpl, others),
		]);
		return new Set(others.filter((id) => blocked.has(id) || optedOut.has(id)));
	} catch (error) {
		throw unavailable(error);
	}
}

export async function hiddenFrom(config, fetchImpl, subjectId, viewerId) {
	return (await hiddenAmong(config, fetchImpl, viewerId, [subjectId])).has(lower(subjectId));
}
