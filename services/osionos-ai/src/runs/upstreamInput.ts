import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import type { FittedFile } from '../files/excerpt.ts';
import type { HistoryMessage, PageContext } from './prompt.ts';
import type { RunMemory } from '../memory/repo.ts';
import type { BuiltinAgent } from '../agents/builtins.ts';
import type { SkillIndex } from '../skills/runSkills.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import type { ChainStep } from './attempt.ts';
import type { Effort } from './effort.ts';

/** The input of the upstream of a run, and the event it emits. */

/** One event of a run, as the client sees it. */
export interface RunEvent {
	id: string;
	type: string;
	data: unknown;
}

/** What the upstream of a run needs to do its work. */
export interface UpstreamRunInput {
	db: Pool;
	redis: Redis;
	runId: string;
	conversationId: string;
	ownerId: string;
	text: string;
	/** Where the model is called, and who pays for it. */
	target: ResolvedTarget;
	/** How hard a reasoning model thinks. */
	effort?: Effort;
	/** The images of this run, as bytes. They go only into this run's user message. */
	images?: readonly { data: Uint8Array; mediaType: string }[];
	/** The text files of this run, already cut to the budget. Same lifetime as the images. */
	files?: readonly FittedFile[];
	emit: (event: RunEvent) => void;
	/** The day of the ledger, and the money the run holds. */
	day: string;
	reserved: number;
	/**
	 * The models the run moves to, in order, when the one before them fails
	 * before it said anything. Each is paid for only when the run gets there.
	 */
	fallbacks?: readonly ChainStep[];
	history: HistoryMessage[];
	pages: readonly PageContext[];
	/** The sources of the answer: the chunks the retrieval found. */
	sources: readonly RetrievedChunk[];
	/** True when the search ran and found nothing that answers (no sources, by design). */
	abstained?: boolean;
	/**
	 * The caller, when the run has one.
	 *
	 * The tools of the assistant read the workspace of the caller, so a run
	 * without a caller has no tools: it answers with what it was given.
	 */
	user?: AuthUser;
	skippedPageIds: readonly string[];
	userMessageId: string;
	/** The title of the conversation: the first frame carries it. */
	title: string;
	/**
	 * The agent that shapes this run, or none.
	 *
	 * None is the general assistant: the base prompt, byte for byte. An agent
	 * adds its block to the prompt and narrows the tools to its own list.
	 */
	agent?: BuiltinAgent | null;
	/** The skills the prompt lists (the agent's built-ins and the workspace's), and their workspace. */
	skillIndex?: SkillIndex;
	/** The approved memories of the caller, quoted in the user turn (devil C39). */
	memories?: readonly RunMemory[];
	workspaceId?: string;
	/** The account block of the caller, when requested. */
	accountBlock?: string;
	/** The view block of the caller, when reported. */
	viewBlock?: string;
	/** The workspace block: the pages the caller can read (plan H1). */
	workspaceBlock?: string;
}
