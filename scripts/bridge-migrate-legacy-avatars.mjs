/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-migrate-legacy-avatars.mjs                  :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one-shot migration of the legacy `data:` avatars.
 *
 * Every identity whose `profile->>avatar` is a `data:` URL gets its bytes
 * checked, stripped of their metadata, stored content-addressed in the
 * `avatars` bucket, and its `osionos_profiles.avatar_url` set to the stored
 * path. A dry run is the default: `--apply` writes.
 *
 * IT NEVER OVERWRITES A NEWER AVATAR. The write carries `avatar_url=is.null`,
 * so a user who uploaded an avatar since the scan wins, and a re-run changes
 * nothing.
 *
 * The `data:` value stays in the identities blob: clearing it needs an in-SQL
 * `profile - 'avatar'`, which is a later models migration (the ledger).
 *
 * The output is COUNTS ONLY — never a URL, an email or a byte.
 */

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { imageInfo, stripImageMetadata } from './bridge-image-meta.mjs';
import { decodeCursor, keyset, pageOf } from './bridge-paging.mjs';
import { createPg } from './bridge-pg.mjs';
import { ensureBucket, storagePut } from './bridge-storage-core.mjs';

const AVATAR_BUCKET = 'avatars';
const PAGE_SIZE = 50;
const MAX_BYTES = 200 * 1024;
const ORDER = [['user_id', 'asc']];
const LEGACY_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

/** The counts of one run. Nothing but numbers ever leaves this function. */
function emptyCounts() {
	return {
		scanned: 0,
		migrated: 0,
		alreadySet: 0,
		wouldMigrate: 0,
		invalid: { tooLarge: 0, unsupported: 0, malformed: 0 },
		failed: 0,
	};
}

/** The bytes of a legacy avatar, or the reason it cannot be one. */
function readLegacyAvatar(value) {
	const match = DATA_URL_RE.exec(String(value ?? ''));
	if (!match) return { reason: 'unsupported' };
	const bytes = Buffer.from(match[2], 'base64');
	if (bytes.length === 0) return { reason: 'unsupported' };
	if (bytes.length > MAX_BYTES) return { reason: 'tooLarge' };
	let info;
	let clean;
	try {
		info = imageInfo(bytes);
		clean = stripImageMetadata(bytes);
	} catch {
		return { reason: 'malformed' };
	}
	if (!LEGACY_TYPES.has(info.type)) return { reason: 'unsupported' };
	return { bytes: clean, type: info.type };
}

/** The avatar_url a user holds today, or null. */
async function currentAvatarUrl(pg, userId) {
	const rows = await pg.asService().get(`osionos_profiles?user_id=eq.${userId}&select=avatar_url&limit=1`);
	const row = Array.isArray(rows) ? rows[0] ?? null : null;
	return typeof row?.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null;
}

/**
 * The run. `apply` is false for the dry run: nothing is stored and nothing is
 * patched, and the counts say what WOULD happen.
 */
export async function migrateLegacyAvatars({ pg, fetchImpl = fetch, env = process.env, apply = false }) {
	const counts = emptyCounts();
	let cursor = null;
	for (;;) {
		const { query, take } = keyset({ order: ORDER, cursor, limit: PAGE_SIZE });
		const rows = await pg.asService().get(`osionos_bridge_identities?select=user_id,profile&profile->>avatar=like.data:*&${query}`);
		const { items, nextCursor } = pageOf(rows, ORDER, take);
		for (const row of items) {
			counts.scanned += 1;
			const legacy = readLegacyAvatar(row?.profile?.avatar);
			if (legacy.reason) {
				counts.invalid[legacy.reason] += 1;
				continue;
			}
			const userId = String(row.user_id ?? '').toLowerCase();
			if (!userId) {
				counts.failed += 1;
				continue;
			}
			if (await currentAvatarUrl(pg, userId)) {
				counts.alreadySet += 1;
				continue;
			}
			if (!apply) {
				counts.wouldMigrate += 1;
				continue;
			}
			try {
				const sha = createHash('sha256').update(legacy.bytes).digest('hex');
				const key = `${sha}.${EXT_BY_TYPE[legacy.type]}`;
				await ensureBucket(userId, AVATAR_BUCKET, fetchImpl, env);
				await storagePut(userId, key, legacy.type, legacy.bytes, fetchImpl, env, AVATAR_BUCKET);
				const written = await pg.asService().patch(
					`osionos_profiles?user_id=eq.${userId}&avatar_url=is.null`,
					{ avatar_url: `/api/media/avatars/${userId}/${key}` },
					{ prefer: 'return=representation' },
				);
				if (Array.isArray(written) && written.length > 0) {
					counts.migrated += 1;
					continue;
				}
				// The write was refused: either the user uploaded an avatar since the
				// scan, or the profile row is gone. Only the second one is a failure.
				if (await currentAvatarUrl(pg, userId)) counts.alreadySet += 1;
				else counts.failed += 1;
			} catch {
				counts.failed += 1;
			}
		}
		if (!nextCursor) break;
		cursor = decodeCursor(nextCursor, ORDER.length);
	}
	return counts;
}

/** The one line an operator reads: counts, and nothing else. */
export function formatCounts(counts, apply) {
	const invalid = counts.invalid;
	return [
		`[osionos-bridge] legacy avatars (${apply ? 'apply' : 'dry run'}):`,
		`scanned=${counts.scanned}`,
		`migrated=${counts.migrated}`,
		`already-set=${counts.alreadySet}`,
		`would-migrate=${counts.wouldMigrate}`,
		`invalid-too-large=${invalid.tooLarge}`,
		`invalid-unsupported=${invalid.unsupported}`,
		`invalid-malformed=${invalid.malformed}`,
		`failed=${counts.failed}`,
	].join(' ');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	// The bridge config is only needed by the command line, so the module stays
	// importable (and testable) without loading the whole bridge.
	const { configFromEnv } = await import('./bridge-api.mjs');
	const apply = process.argv.slice(2).includes('--apply');
	const pg = createPg({ config: configFromEnv() });
	const counts = await migrateLegacyAvatars({ pg, apply });
	console.log(formatCounts(counts, apply));
}
