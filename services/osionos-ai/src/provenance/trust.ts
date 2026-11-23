import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';

/**
 * How many ancestors the walk follows; a page deeper than this is untrusted.
 *
 * Caveat (R1, R2): a legitimate page nested deeper than 64 levels is treated as
 * untrusted, so it taints and cards. That over-taints (the safe direction); it
 * never trusts a page it could not verify.
 */
const MAX_DEPTH = 64;
/** The trust rule for a row someone may have edited: only the user ever wrote it. */
export function writtenOnlyBy(userId: string, createdBy: string, updatedBy: string): boolean {
	return createdBy === userId && updatedBy === userId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One query: each page and its ancestors, up to MAX_DEPTH, and the verdict on
 * the workspace (another member, or a share rule that lets someone edit or
 * comment). A page is untrusted when it is missing, any link of its chain breaks
 * a rule, or when the chain is still going at the bound (a cycle or a very deep
 * tree: fail closed).
 */
const SQL = `
with recursive chain as (
	select p.id as start_id, p.parent_page_id, p.workspace_id, p.owner_id, p.visibility, p.collaborators, 1 as depth
	from public.osionos_pages p
	where p.id = any($1::uuid[])
	union all
	select c.start_id, p.parent_page_id, p.workspace_id, p.owner_id, p.visibility, p.collaborators, c.depth + 1
	from chain c
	join public.osionos_pages p on p.id = c.parent_page_id
	where c.depth < ${MAX_DEPTH}
),
shared_workspace as (
	select exists (select 1 from public.osionos_workspace_members m where m.workspace_id = $2::uuid and m.user_id <> $3::uuid)
	    or exists (select 1 from public.osionos_share_rules r
	               where r.workspace_id = $2::uuid and r.permission in ('can_comment', 'can_edit', 'full_access')) as untrusted
)
select u.id::text as id
from unnest($1::uuid[]) as u(id)
where not exists (select 1 from public.osionos_pages p where p.id = u.id)
   or exists (
	select 1 from chain c, shared_workspace w
	where c.start_id = u.id
	  and (w.untrusted
	    or c.workspace_id is distinct from $2::uuid
	    or c.owner_id is distinct from $3::uuid
	    or c.visibility in ('shared', 'public')
	    or cardinality(public.ai_collaborator_ids(c.collaborators)) > 0
	    or (c.depth = ${MAX_DEPTH} and c.parent_page_id is not null)
	    or (c.parent_page_id is not null
	        and not exists (select 1 from public.osionos_pages q where q.id = c.parent_page_id))))`;

/**
 * The pages, among `pageIds`, whose content the user cannot vouch for, in the
 * order they were given; a missing page, or an id that is no uuid, is one.
 *
 * Caveat (AM3): trust is today's ACL, not write history (the bridge has no
 * last-editor column). It under-reports in three ways: a page shared with edit
 * or comment access and later made private still holds what another member
 * wrote; the user's own pasted hostile text is trusted (R1); a share rule added
 * after the read is not seen (R2). It over-reports for a private workspace with
 * any grant rule anywhere: every page there is untrusted. The escape hatch for
 * both is manual mode. What would fix it is a per-page last-writer record.
 */
export async function untrustedPageIds(db: Pool, user: AuthUser, pageIds: readonly string[]): Promise<string[]> {
	const wellFormed = pageIds.filter((id) => UUID.test(id));
	const bad = new Set<string>();
	if (wellFormed.length > 0) {
		const rows = await db.query<{ id: string }>(SQL, [wellFormed, user.workspaceId, user.userId]);
		for (const row of rows.rows) bad.add(row.id);
	}
	return pageIds.filter((id) => !UUID.test(id) || bad.has(id.toLowerCase()));
}
