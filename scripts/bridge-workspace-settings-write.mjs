/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-settings-write.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one way to write osionos_workspaces.settings. The column is one jsonb that two
 * routes rewrite whole (the settings panel and the Library views), so each write is
 * conditional on the updated_at it read: a write that lost the race matches no row and
 * is retried once on a fresh read, then refused with 409. Without this, a settings edit
 * landing between the Library's read and write would silently wipe the admin's views.
 *
 * Every successful write moves updated_at strictly forward (at least 1 ms past the stamp it
 * replaces), so two writes in the same millisecond still leave different stamps. The stamp
 * read back is echoed as PostgREST sent it, URL-encoded: a `+` in the offset would
 * otherwise decode to a space, and microseconds must not be rounded off.
 */

const ATTEMPTS = 2;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const settingsConflict = () => Object.assign(
	new Error('The workspace settings changed while saving; reload and try again.'),
	{ status: 409, code: 'settings_conflict' },
);

function nextStamp(previous, now) {
	const before = Date.parse(previous ?? '');
	return new Date(Number.isNaN(before) ? now : Math.max(now, before + 1)).toISOString();
}

function sameStampFilter(stamp) {
	return stamp == null ? 'updated_at=is.null' : `updated_at=eq.${encodeURIComponent(stamp)}`;
}

/**
 * Write `next(currentSettings)` (plus `columns`) if nobody wrote in between.
 * `next` may throw to refuse the write; `wrap` sees the PATCH promise (bumpAccessAfter).
 * Returns the written `{ settings, updated_at }`.
 */
export async function writeWorkspaceSettings(service, workspaceId, next, { columns = {}, wrap = (write) => write, now = Date.now } = {}) {
	for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
		const rows = await service.get(`osionos_workspaces?id=eq.${workspaceId}&select=settings,updated_at&limit=1`);
		const row = Array.isArray(rows) ? rows[0] : null;
		if (!row) throw Object.assign(new Error('Workspace not found.'), { status: 404, code: 'workspace_not_found' });
		const settings = next(isObject(row.settings) ? { ...row.settings } : {});
		const body = { ...columns, settings, updated_at: nextStamp(row.updated_at, now()) };
		const path = `osionos_workspaces?id=eq.${workspaceId}&${sameStampFilter(row.updated_at)}&select=settings,updated_at`;
		const written = await wrap(service.patch(path, body, { prefer: 'return=representation' }));
		if (Array.isArray(written) && written.length > 0) return written[0];
	}
	throw settingsConflict();
}
