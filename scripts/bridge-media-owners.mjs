/**
 * osionos#233 D233-12: whose media a reader of one page may have signed. A path appearing in a
 * readable page is not enough (the caller's own page is always readable, so anyone could plant a
 * victim's path there and sign it). The path's owner must also be the page's owner or a member of
 * the page's workspace, so a page only ever opens media of the people who share its workspace.
 *
 * Collaborators are not a way in: a page POST does not check that they are members (only PATCH
 * does), so a collaborator entry is something the page owner can write about anyone.
 *
 * Caveat: membership is read now, not when the image was inserted. The image of someone who has
 * since left the workspace is no longer signed on its pages (it renders bare while enforce is off,
 * and is refused once it is on), and a teammate who shares a workspace with you can still sign
 * your media through any page of that workspace, by design. A workspace owner with no member row
 * (the readablePageAccess fallback) is not counted, so their media on a teammate's page stays bare.
 */

import { rest } from './bridge-social-core.mjs';
import { idChunks, inFilter, runChunks } from './bridge-paging.mjs';

const lower = (value) => String(value ?? '').toLowerCase();

async function membersAmong(workspaceId, userIds, config, fetchImpl) {
	const parts = await runChunks(idChunks(userIds), (chunk) => rest(config, fetchImpl,
		`osionos_workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&${inFilter('user_id', chunk)}&select=user_id`));
	return parts.flat().map((row) => lower(row?.user_id));
}

/**
 * The owners among `ownerIds` (lower-case uuids) whose media may be signed for a reader of `row`.
 * One membership read per 50 foreign owners; a failed read allows none of them (never a guess).
 */
export async function pageMediaOwners(row, ownerIds, config, fetchImpl) {
	const pageOwner = lower(row?.owner_id);
	const allowed = new Set(ownerIds.filter((id) => id === pageOwner));
	const others = ownerIds.filter((id) => id !== pageOwner);
	if (others.length === 0 || !row?.workspace_id) return allowed;
	try {
		for (const id of await membersAmong(row.workspace_id, others, config, fetchImpl)) allowed.add(id);
	} catch {
		return allowed;
	}
	return allowed;
}
