import { randomUUID } from 'node:crypto';
import type { Harness } from './harness.ts';

/**
 * The setup of the thread-run admission tests (osio-bot OB8–OB10): a channel
 * with one fresh "@ai" trigger, the POST of a thread run, and the read of a
 * refusal. Type-only import of the harness: a test sets its environment
 * before it imports the harness, and this file must not import it first.
 */
export interface ThreadTrigger {
	channelId: string;
	messageId: string;
}

export function threadKit(harness: Pick<Harness, 'app' | 'base' | 'tokenFor'>, asker: string, workspaceId: string) {
	const { app, base, tokenFor } = harness;

	const joinWorkspace = (): Promise<unknown> =>
		app.db.query(
			"insert into public.osionos_workspace_members (workspace_id, user_id, role) values ($1, $2, 'member') on conflict do nothing",
			[workspaceId, asker],
		);

	const seedTrigger = async (): Promise<ThreadTrigger> => {
		const channelId = randomUUID();
		const messageId = randomUUID();
		await app.db.query('insert into public.osionos_channels (id, workspace_id, kind, is_private) values ($1, $2, $3, false)', [channelId, workspaceId, 'text']);
		await app.db.query(
			'insert into public.osionos_messages (id, channel_id, author_id, content, created_at) values ($1, $2, $3, $4, now())',
			[messageId, channelId, asker, '@ai what did we decide?'],
		);
		return { channelId, messageId };
	};

	const postThreadRun = (body: Record<string, unknown>): Promise<Response> =>
		fetch(`${base}/api/ai/thread-runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(asker, workspaceId)}`, 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

	return { joinWorkspace, seedTrigger, postThreadRun };
}

export async function refusal(response: Response): Promise<{ status: number; code: unknown; retryAfter: string | null }> {
	const body = (await response.json()) as { code?: unknown };
	return { status: response.status, code: body.code, retryAfter: response.headers.get('retry-after') };
}

/** Polls `ready` every 10 ms for at most `ms`: a run in flight is seen by its upstream request. */
export async function until(ready: () => boolean, ms = 3_000): Promise<boolean> {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 10))) {
		if (ready()) return true;
	}
	return ready();
}
