import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { RESERVED_COMMAND_NAMES, templateProblem } from '../commands/userCommands.ts';
import { config } from '../config.ts';
import { buildUserContext, takenSkillIds } from '../context/runContext.ts';
import { RULE_BODY_MAX, archiveItem, createItem, listActiveItems, updateItem } from '../context/repo.ts';
import type { ChangeOutcome, ContextItem, ContextKind, ContextOwner, CreateOutcome } from '../context/repo.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { checkRateLimit } from '../rateLimit.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { BUILTIN_SKILL_IDS } from '../skills/builtins.ts';
import { listActiveSkills } from '../skills/repo.ts';
import { buildSkillIndex } from '../skills/runSkills.ts';
import { createSchema, gate, updateSchema } from './skills.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The AI context items: a user's own skills and rules and a workspace's rules
 * (U1, OSIONOS_AI_USER_CONTEXT), a user's own slash commands (U2,
 * OSIONOS_AI_USER_COMMANDS).
 *
 * GET    /api/ai/context/items[?workspace=<id>]   the caller's own items
 * POST   /api/ai/context/items                    { kind, slug, name, description, body }
 * PUT    /api/ai/context/items/:id                replaces name, description, body
 * DELETE /api/ai/context/items/:id                archives
 * GET    /api/ai/workspaces/:ws/rules             any live member
 * POST   /api/ai/workspaces/:ws/rules             owner/admin (C1006)
 * PUT    /api/ai/workspaces/:ws/rules/:slug       owner/admin
 * DELETE /api/ai/workspaces/:ws/rules/:slug       owner/admin
 *
 * The owner of a user item is the caller, from the token, never from the
 * path: another user's id is a 404 like an unknown one (C1003). Writes are 20
 * a minute per user (C1015). A rule body over RULE_BODY_MAX is a 422.
 *
 * A kind whose flag is off does not exist here (C1102): not listed, a create
 * is a 400, a PUT or DELETE of an existing row of it a 404 like a stranger's
 * — the row waits, untouched, for the flag or for the user's erasure. A
 * command's slug is its name: a built-in or composer action name is a 409
 * `command_reserved`, a template with two $ARGUMENTS a 422.
 *
 * Caveat: `inPrompt` is computed against the workspace given in `?workspace=`
 * (its rules come first and its skill slugs take precedence); without it, as
 * a run with no workspace. A research run lists no user skills at all, which
 * `inPrompt` does not say.
 */

const WRITES_PER_MINUTE = 20;
const RATE_PREFIX = 'ai:rl:context';

const itemCreateSchema = z.object({ kind: z.enum(['skill', 'rule', 'command']), ...createSchema.shape }).strict();

/** The kinds this deployment serves on the user routes, by flag. */
function servedKinds(): ContextKind[] {
	return [...(config.userContextEnabled ? (['skill', 'rule'] as const) : []), ...(config.userCommandsEnabled ? (['command'] as const) : [])];
}

function refuse(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

async function writeAllowed(ctx: RouteContext, userId: string): Promise<boolean> {
	const rate = await checkRateLimit(ctx.deps.redis, userId, WRITES_PER_MINUTE, new Date(), RATE_PREFIX);
	if (!rate.allowed) ctx.response.setHeader('retry-after', String(rate.retryAfterSeconds));
	return rate.allowed;
}

/** `inPrompt` only in a list: a write cannot know the workspace of the next run, so it leaves it out. */
function toContract(item: ContextItem, inPrompt?: boolean): Record<string, unknown> {
	return {
		id: item.id,
		kind: item.kind,
		scope: item.scope,
		slug: item.slug,
		name: item.name,
		description: item.description,
		body: item.body,
		version: item.version,
		createdBy: item.created_by,
		updatedBy: item.updated_by,
		updatedAt: item.updated_at.toISOString(),
		...(inPrompt === undefined ? {} : { inPrompt }),
	};
}

function logWrite(action: string, owner: ContextOwner, item: ContextItem, actorId: string): void {
	const where = owner.scope === 'workspace' ? { workspaceId: owner.workspaceId } : {};
	console.info(JSON.stringify({ event: 'ai_context_written', action, kind: item.kind, scope: item.scope, ...where, itemId: item.id, version: item.version, actorId }));
}

/** What a run of `user` in `workspaceId` would carry: the ids in the prompt. */
async function includedIds(ctx: RouteContext, user: AuthUser, workspaceId: string | null, userItems: readonly ContextItem[]): Promise<ReadonlySet<string>> {
	const live = workspaceId && UUID.test(workspaceId) ? (await liveMemberWorkspaces(ctx.deps.db, user)).includes(workspaceId) : false;
	const workspaceRules = live ? await listActiveItems(ctx.deps.db, { scope: 'workspace', workspaceId: workspaceId as string }, ['rule']) : [];
	const index = live ? buildSkillIndex([], await listActiveSkills(ctx.deps.db, workspaceId as string)) : null;
	return buildUserContext({ workspaceRules, userItems, taken: takenSkillIds(index), skills: true }).included;
}

function answerCreate(ctx: RouteContext, outcome: CreateOutcome, owner: ContextOwner, actorId: string): number {
	if (outcome.kind === 'unavailable') return refuse(ctx, 503, 'context_unavailable');
	if (outcome.kind === 'limit') return refuse(ctx, 409, 'context_limit');
	if (outcome.kind === 'exists') return refuse(ctx, 409, 'context_exists');
	logWrite('create', owner, outcome.item, actorId);
	sendJson(ctx.response, 201, toContract(outcome.item));
	return 201;
}

function answerChange(ctx: RouteContext, outcome: ChangeOutcome, action: 'update' | 'archive', owner: ContextOwner, actorId: string): number {
	if (outcome.kind === 'missing') return refuse(ctx, 404, 'not_found');
	if (outcome.kind === 'too_long') return refuse(ctx, 422, 'rule_too_long');
	if (outcome.kind === 'bad_template') return refuse(ctx, 422, 'command_template');
	logWrite(action, owner, outcome.item, actorId);
	if (action === 'archive') {
		sendNoContent(ctx.response);
		return 204;
	}
	sendJson(ctx.response, 200, toContract(outcome.item));
	return 200;
}

/** GET /api/ai/context/items */
export async function handleContextItemsList(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const items = await listActiveItems(ctx.deps.db, { scope: 'user', ownerId: user.userId }, servedKinds());
	// No run reads a command: with the context flag off nothing is in a prompt.
	const included = config.userContextEnabled ? await includedIds(ctx, user, ctx.url.searchParams.get('workspace'), items) : new Set<string>();
	sendJson(ctx.response, 200, { items: items.map((item) => toContract(item, included.has(item.id))) });
	return 200;
}

/** POST /api/ai/context/items */
export async function handleContextItemCreate(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, itemCreateSchema);
	if (!servedKinds().includes(body.kind)) return refuse(ctx, 400, 'invalid_request');
	if (body.kind === 'rule' && body.body.length > RULE_BODY_MAX) return refuse(ctx, 422, 'rule_too_long');
	if (body.kind === 'command' && RESERVED_COMMAND_NAMES.has(body.slug)) return refuse(ctx, 409, 'command_reserved');
	if (body.kind === 'command' && templateProblem(body.body)) return refuse(ctx, 422, 'command_template');
	// C1001: a built-in id is never a user skill's.
	if (body.kind === 'skill' && BUILTIN_SKILL_IDS.includes(body.slug)) return refuse(ctx, 409, 'skill_builtin');
	if (!(await writeAllowed(ctx, user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'user', ownerId: user.userId };
	const outcome = await createItem(ctx.deps.db, { ...body, owner, actorId: user.userId });
	return answerCreate(ctx, outcome, owner, user.userId);
}

/** The caller and their item id, or a refusal: a malformed id is a 404 like a stranger's. */
function ownItem(ctx: RouteContext): { user: AuthUser; id: string } | null {
	const user = requireUser(ctx);
	if (!user) return null;
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) {
		sendError(ctx.response, 404, 'not_found');
		return null;
	}
	return { user, id };
}

/** PUT /api/ai/context/items/:id */
export async function handleContextItemUpdate(ctx: RouteContext): Promise<number> {
	const caller = ownItem(ctx);
	if (!caller) return ctx.response.statusCode;
	const body = await readJson(ctx.request, updateSchema);
	if (!(await writeAllowed(ctx, caller.user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'user', ownerId: caller.user.userId };
	const outcome = await updateItem(ctx.deps.db, { ...body, owner, ref: { id: caller.id, kinds: servedKinds() }, actorId: caller.user.userId });
	return answerChange(ctx, outcome, 'update', owner, caller.user.userId);
}

/** DELETE /api/ai/context/items/:id */
export async function handleContextItemArchive(ctx: RouteContext): Promise<number> {
	const caller = ownItem(ctx);
	if (!caller) return ctx.response.statusCode;
	if (!(await writeAllowed(ctx, caller.user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'user', ownerId: caller.user.userId };
	const outcome = await archiveItem(ctx.deps.db, { owner, ref: { id: caller.id, kinds: servedKinds() }, actorId: caller.user.userId });
	return answerChange(ctx, outcome, 'archive', owner, caller.user.userId);
}

/** GET /api/ai/workspaces/:ws/rules */
export async function handleWorkspaceRulesList(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'member');
	if (!caller) return ctx.response.statusCode;
	const rules = await listActiveItems(ctx.deps.db, { scope: 'workspace', workspaceId: caller.workspaceId }, ['rule']);
	// The workspace rules come first in a run: their place does not depend on the user's.
	const included = buildUserContext({ workspaceRules: rules, userItems: [], taken: new Set(), skills: false }).included;
	sendJson(ctx.response, 200, { rules: rules.map((rule) => toContract(rule, included.has(rule.id))) });
	return 200;
}

/** POST /api/ai/workspaces/:ws/rules */
export async function handleWorkspaceRuleCreate(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	const body = await readJson(ctx.request, createSchema);
	if (body.body.length > RULE_BODY_MAX) return refuse(ctx, 422, 'rule_too_long');
	if (!(await writeAllowed(ctx, caller.user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'workspace', workspaceId: caller.workspaceId };
	const outcome = await createItem(ctx.deps.db, { ...body, kind: 'rule', owner, actorId: caller.user.userId });
	return answerCreate(ctx, outcome, owner, caller.user.userId);
}

/** PUT /api/ai/workspaces/:ws/rules/:slug */
export async function handleWorkspaceRuleUpdate(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	const body = await readJson(ctx.request, updateSchema);
	if (!(await writeAllowed(ctx, caller.user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'workspace', workspaceId: caller.workspaceId };
	const ref = { kind: 'rule' as const, slug: ctx.params[1] ?? '' };
	const outcome = await updateItem(ctx.deps.db, { ...body, owner, ref, actorId: caller.user.userId });
	return answerChange(ctx, outcome, 'update', owner, caller.user.userId);
}

/** DELETE /api/ai/workspaces/:ws/rules/:slug */
export async function handleWorkspaceRuleArchive(ctx: RouteContext): Promise<number> {
	const caller = await gate(ctx, 'admin');
	if (!caller) return ctx.response.statusCode;
	if (!(await writeAllowed(ctx, caller.user.userId))) return refuse(ctx, 429, 'rate_limited');
	const owner: ContextOwner = { scope: 'workspace', workspaceId: caller.workspaceId };
	const ref = { kind: 'rule' as const, slug: ctx.params[1] ?? '' };
	const outcome = await archiveItem(ctx.deps.db, { owner, ref, actorId: caller.user.userId });
	return answerChange(ctx, outcome, 'archive', owner, caller.user.userId);
}
