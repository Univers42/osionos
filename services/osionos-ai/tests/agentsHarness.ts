import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { WORKSPACE_A } from './harness.ts';
import type { JsonBody } from './harness.ts';

/**
 * The service with custom agents on, and the helpers the agent tests share:
 * users with a real member row (authority reads the live row, C330), the
 * routes as a user, and a run that names an agent.
 *
 * The environment is set here, before the harness imports the service: the
 * service reads its configuration when it is imported.
 */
export type Role = 'owner' | 'member' | 'viewer';

export interface Actor {
	id: string;
	token: string;
}

const PERMISSIONS: Record<Role, string[]> = { owner: [], member: ['read', 'create'], viewer: ['read'] };

export async function startAgents() {
	process.env.OSIONOS_AI_CUSTOM_AGENTS = 'on';
	const { startHarness } = await import('./harness.ts');
	const harness = await startHarness();
	const { app, mock, bridge, tokenFor, call, base, createConversation } = harness;
	// The database is shared by the files of a run and the workspace cap is 8: each
	// file starts and ends with no live workspace agent in the shared workspace.
	const retire = () =>
		app.db.query(
			"update public.ai_agents set archived_at = now() where scope = 'workspace' and workspace_id = $1 and archived_at is null",
			[WORKSPACE_A],
		);
	await retire();
	after(async () => {
		await retire();
		await app.close();
		await mock.close();
		await bridge.close();
	});

	/** A fresh user with a member row in the workspace: fresh, so no rate window or cap is shared. */
	const actor = async (role: Role = 'member', workspaceId = WORKSPACE_A): Promise<Actor> => {
		const id = randomUUID();
		await app.db.query(
			'insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, $3, $4)',
			[workspaceId, id, role === 'owner' ? 'owner' : 'member', PERMISSIONS[role]],
		);
		return { id, token: tokenFor(id, WORKSPACE_A) };
	};
	const setRole = (who: Actor, role: Role | 'none') =>
		role === 'none'
			? app.db.query('delete from public.osionos_workspace_members where user_id = $1', [who.id])
			: app.db.query('update public.osionos_workspace_members set role = $2, permissions = $3 where user_id = $1', [
					who.id,
					role === 'owner' ? 'owner' : 'member',
					PERMISSIONS[role],
				]);
	const as = (who: Actor, method: string, path: string, body?: unknown) =>
		call(path, { method, token: who.token, body });
	const draft = (extra: JsonBody = {}): JsonBody => ({
		scope: 'user',
		name: 'Reviewer',
		instructions: 'Review the page and list the gaps.',
		...extra,
	});
	/** An agent created through the route; its view. */
	const make = async (who: Actor, extra: JsonBody = {}): Promise<{ id: string; version: number } & JsonBody> => {
		const made = await as(who, 'POST', '/api/ai/agents', draft(extra));
		if (made.status !== 201) throw new Error(`create answered ${made.status} ${JSON.stringify(made.body)}`);
		return made.body as { id: string; version: number } & JsonBody;
	};
	const settings = (workspaceId: string, values: Partial<{ agents_enabled: boolean; custom_agents_allowed: boolean }>) =>
		app.db.query(
			`insert into public.ai_workspace_agent_settings (workspace_id, agents_enabled, custom_agents_allowed)
			 values ($1, $2, $3)
			 on conflict (workspace_id) do update set agents_enabled = excluded.agents_enabled, custom_agents_allowed = excluded.custom_agents_allowed`,
			[workspaceId, values.agents_enabled ?? true, values.custom_agents_allowed ?? false],
		);
	const conversationOf = (who: Actor) => createConversation('thread', who.token);
	/** A run of the actor, naming an agent. */
	const runWith = async (
		who: Actor,
		agentId: string | undefined,
		options: { text?: string; model?: string; runId?: string; conversationId?: string } = {},
	): Promise<Response> =>
		fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${who.token}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				runId: options.runId ?? randomUUID(),
				conversationId: options.conversationId ?? (await conversationOf(who)),
				text: options.text ?? 'hello',
				...(options.model ? { model: options.model } : {}),
				...(agentId ? { agentId } : {}),
			}),
		});
	return { ...harness, actor, setRole, as, draft, make, settings, runWith, conversationOf };
}
