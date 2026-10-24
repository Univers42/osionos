import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { canAccessWorkspace } from '../workspaceAccess.ts';
import { BUILTIN_SKILL_IDS } from '../skills/builtins.ts';
import { archiveSkill, createSkill, listActiveSkills, updateSkill } from '../skills/repo.ts';
import type { ChangeOutcome, WorkspaceSkill } from '../skills/repo.ts';
import { buildSkillIndex } from '../skills/runSkills.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The skills of a workspace: any live member reads them, a workspace
 * owner/admin writes them (devil C41).
 *
 * GET    /api/ai/workspaces/:ws/skills
 * POST   /api/ai/workspaces/:ws/skills
 * PUT    /api/ai/workspaces/:ws/skills/:slug   (replaces name, description, body)
 * DELETE /api/ai/workspaces/:ws/skills/:slug   (archives)
 *
 * The authority is read LIVE on every request, never from the token: a member
 * is a 403 on a write, a non-member is a 404 (the answer must not tell the
 * workspace exists), and a removed admin is a non-member from the next call.
 * The caps are the database's (devil C47).
 */

const fieldsShape = {
	name: z.string().trim().min(1).max(80),
	description: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.refine((value) => !/[\r\n]/.test(value), 'description must be one line'),
	body: z.string().min(1).max(6000),
};
const updateSchema = z.object(fieldsShape).strict();
const createSchema = z
	.object({ slug: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/, 'slug must be kebab-case, 2 to 32 characters'), ...fieldsShape })
	.strict();

type Authority = 'none' | 'member' | 'admin';

/** What the caller is in the workspace, from the live members table. */
async function authorityIn(ctx: RouteContext, user: AuthUser, workspaceId: string): Promise<Authority> {
	const live = await liveMemberWorkspaces(ctx.deps.db, user);
	if (!live.includes(workspaceId)) return 'none';
	return (await canAccessWorkspace(ctx.deps.db, user, workspaceId, 'admin')) ? 'admin' : 'member';
}

function toContract(skill: WorkspaceSkill, inIndex: boolean): Record<string, unknown> {
	return {
		id: skill.id,
		slug: skill.slug,
		name: skill.name,
		description: skill.description,
		body: skill.body,
		version: skill.version,
		updatedAt: skill.updated_at.toISOString(),
		inIndex,
	};
}

/** Refuses and returns null unless the caller holds `needed` in the workspace. */
async function gate(ctx: RouteContext, needed: 'member' | 'admin'): Promise<{ user: AuthUser; workspaceId: string } | null> {
	const user = requireUser(ctx);
	if (!user) return null;
	const workspaceId = ctx.params[0] ?? '';
	if (!UUID.test(workspaceId)) {
		sendError(ctx.response, 404, 'not_found');
		return null;
	}
	const authority = await authorityIn(ctx, user, workspaceId);
	if (authority === 'none') {
		sendError(ctx.response, 404, 'not_found');
		return null;
	}
	if (needed === 'admin' && authority !== 'admin') {
		sendError(ctx.response, 403, 'forbidden');
		return null;
	}
	return { user, workspaceId };
}

function logWrite(action: string, workspaceId: string, skill: WorkspaceSkill, actorId: string): void {
	console.info(JSON.stringify({ event: 'workspace_skill_written', action, workspaceId, skillId: skill.id, version: skill.version, actorId }));
}

/** GET /api/ai/workspaces/:ws/skills */
export async function handleSkillsList(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'member');
	if (!caller) return ctx.response.statusCode;
	const skills = await listActiveSkills(ctx.deps.db, caller.workspaceId);
	// `inIndex`: whether the prompt offers the skill, given the cap of the index.
	const listed = new Set(buildSkillIndex([], skills).entries.map((entry) => entry.id));
	sendJson(ctx.response, 200, { skills: skills.map((skill) => toContract(skill, listed.has(skill.slug))) });
	return 200;
}

/** POST /api/ai/workspaces/:ws/skills */
export async function handleSkillCreate(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	const body = await readJson(ctx.request, createSchema);
	// The built-ins live in the code: the database cannot refuse their ids.
	if (BUILTIN_SKILL_IDS.includes(body.slug)) {
		sendError(ctx.response, 409, 'skill_builtin');
		return 409;
	}
	const outcome = await createSkill(ctx.deps.db, { ...body, workspaceId: caller.workspaceId, actorId: caller.user.userId });
	if (outcome.kind !== 'created') {
		const code = outcome.kind === 'limit' ? 'skill_limit' : 'skill_exists';
		sendError(ctx.response, 409, code);
		return 409;
	}
	logWrite('create', caller.workspaceId, outcome.skill, caller.user.userId);
	sendJson(ctx.response, 201, toContract(outcome.skill, true));
	return 201;
}

function answerChange(ctx: RouteContext, outcome: ChangeOutcome, action: string, workspaceId: string, actorId: string): number {
	if (outcome.kind === 'missing') {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	logWrite(action, workspaceId, outcome.skill, actorId);
	if (action === 'archive') {
		sendNoContent(ctx.response);
		return 204;
	}
	sendJson(ctx.response, 200, toContract(outcome.skill, true));
	return 200;
}

/** PUT /api/ai/workspaces/:ws/skills/:slug */
export async function handleSkillUpdate(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	const body = await readJson(ctx.request, updateSchema);
	const outcome = await updateSkill(ctx.deps.db, {
		...body,
		workspaceId: caller.workspaceId,
		slug: ctx.params[1] ?? '',
		actorId: caller.user.userId,
	});
	return answerChange(ctx, outcome, 'update', caller.workspaceId, caller.user.userId);
}

/** DELETE /api/ai/workspaces/:ws/skills/:slug */
export async function handleSkillArchive(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	const outcome = await archiveSkill(ctx.deps.db, {
		workspaceId: caller.workspaceId,
		slug: ctx.params[1] ?? '',
		actorId: caller.user.userId,
	});
	return answerChange(ctx, outcome, 'archive', caller.workspaceId, caller.user.userId);
}
