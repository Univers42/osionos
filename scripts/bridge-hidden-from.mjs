/**
 * The one rule for "may this viewer see this person": a subject is hidden from a viewer
 * when it is not the viewer and either opted out of the directory or a block lies between
 * them in either direction. The profile, the account card, the follow counts and the follow
 * lists all ask here, so the rule cannot drift between routes.
 *
 * It fails closed: a lookup that errors is not "visible". The caller gets a 503 and no
 * data, because answering from a half-read rule would hand out what a block hides.
 *
 * Caveat: a person is opted out when EITHER osionos_bridge_identities or osionos_profiles says
 * so, because the legacy toggle (PATCH /api/profile/me) writes only the identity row and the
 * account writers (PATCH /api/account/profile, bridge-account-users.mjs:136 admin patch) write
 * only the profile row; the database trigger that mirrors them is not assumed to be applied.
 * What stays wrong is over-hiding: if the mirror is absent, opting back in through one writer
 * leaves a stale `true` in the other table, and the person stays hidden. Both writers can cause
 * it. Opting in again through the writer that set `true` in the first place clears it. Hiding
 * too much is the safe direction; an unknown id (no row in either table) is not hidden.
 */

import { UUID_REGEX, blockedViewerBy, readInChunks, rest } from './bridge-social-core.mjs';
import { inFilter } from './bridge-paging.mjs';

const lower = (id) => String(id ?? '').toLowerCase();

const OPT_OUT_TABLES = ['osionos_profiles', 'osionos_bridge_identities'];

async function optedOutIn(table, config, fetchImpl, ids) {
	const rows = await readInChunks(ids, async (chunk) => {
		const part = await rest(config, fetchImpl, `${table}?${inFilter('user_id', chunk)}&directory_opt_out=eq.true&select=user_id`);
		return Array.isArray(part) ? part : [];
	});
	return rows.map((row) => lower(row.user_id));
}

async function optedOutAmong(config, fetchImpl, ids) {
	const found = await Promise.all(OPT_OUT_TABLES.map((table) => optedOutIn(table, config, fetchImpl, ids)));
	return new Set(found.flat());
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
