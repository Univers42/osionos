import { z } from 'zod';
import { MAX_BODY, propose } from '../memory/repo.ts';
import type { ProposalTool } from './types.ts';

/**
 * `remember`: the model proposes a short fact, preference or convention about
 * the user. It is a PROPOSAL write (devil C42): it has an execute and never
 * asks, but what it writes is `proposed` and inert — no prompt carries it until
 * the user approves it in Settings › AI memory.
 *
 * A run may propose at most MAX_PER_RUN memories: the tool is built per run and
 * counts its successes.
 */

export const MAX_PER_RUN = 3;

const rememberArgs = z.object({
	text: z.string().min(1).max(MAX_BODY).describe('one short fact, preference or convention about the user, in one sentence'),
});

export interface RememberData {
	id: string;
	body: string;
}

export function rememberTool(run: {
	workspaceId: string;
	runId: string;
}): ProposalTool<z.infer<typeof rememberArgs>, RememberData> {
	let proposals = 0;
	return {
		name: 'remember',
		description:
			'Propose a short fact, preference or convention about the user for the user to approve. Nothing is remembered until they approve it.',
		kind: 'proposal',
		input: rememberArgs,
		async run(ctx, args) {
			if (proposals >= MAX_PER_RUN) return { ok: false, error: `at most ${MAX_PER_RUN} proposals per run` };
			const outcome = await propose(ctx.db, {
				userId: ctx.user.userId,
				workspaceId: run.workspaceId,
				body: args.text,
				runId: run.runId,
			});
			if (!outcome.ok) {
				return { ok: false, error: outcome.reason === 'too_many_pending' ? 'the user has too many proposals waiting' : 'the text is not a valid memory' };
			}
			proposals += 1;
			return { ok: true, data: { id: outcome.memory.id, body: outcome.memory.body } };
		},
		render: (data) =>
			`Proposed for the user's approval (id ${data.id}). It is not remembered until the user approves it in Settings › AI memory.`,
		sources: () => [],
		proposed: (data) => ({ id: data.id, body: data.body }),
	};
}
