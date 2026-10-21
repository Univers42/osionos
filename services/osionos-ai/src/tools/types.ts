import type { Pool } from 'pg';
import type { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';

/**
 * The tools of the assistant: what the model may call, and what it may not.
 *
 * A tool is a name, a description, a schema of arguments, and the work. The
 * kind says what it does to the workspace: a read tool only reads, a write
 * tool changes something and waits for a human before it does.
 *
 * The context of a tool is split in two, and the split is the point. The
 * token of the caller is a full-account bearer: it opens the bridge, it
 * carries the workspaces and the flag of the administrator, and it must never
 * leave the one request that decided. A read tool has no use for it, so a read
 * tool never holds it: a tool that cannot hold the token cannot leak it — not
 * in a log, not in a result, not in the transcript of the answer, and not in
 * the hands of the provider.
 */

/** What a tool does to the workspace. */
export type ToolKind = 'read' | 'write';

/**
 * What a read tool gets: the database of the service, and the caller.
 *
 * There is no secret in here. The user id, the workspaces of the token and
 * the flag of the administrator are claims, not credentials.
 */
export interface ReadToolContext {
	/** The database of the service. */
	db: Pool;
	/**
	 * The caller: the claims of the token.
	 *
	 * The workspaces of the caller are read LIVE, at the moment of the call,
	 * from the members table: a membership that ends ends at once, and a tool
	 * never inherits the workspaces of another step.
	 */
	user: AuthUser;
}

/**
 * What a write tool gets: the read context, and the token of the caller.
 *
 * The token is the one of the request that decided, and it is never stored.
 */
export interface WriteToolContext extends ReadToolContext {
	/** The app session token of the caller. It never leaves the write path. */
	sessionToken: string;
}

/** The answer of a tool: the data, or the reason there is none. */
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One tool the model may call.
 *
 * The work of a tool and the text the model reads of it are two things: the
 * work returns the data, and the render quotes it as data. The text of a page
 * is never markup, whatever the model asks for.
 */
export interface AssistantTool<TArgs, TData> {
	/** The name the model calls it by. */
	name: string;
	/** What the tool does, in one line: the model decides with this. */
	description: string;
	/** What the tool does to the workspace. */
	kind: ToolKind;
	/** The schema of the arguments: the model may not call it with anything else. */
	input: z.ZodType<TArgs>;
	/** The work of the tool. */
	run(ctx: ReadToolContext, args: TArgs): Promise<ToolResult<TData>>;
	/**
	 * The text the model reads: the data of the tool, quoted as data.
	 *
	 * `firstSourceNumber` is the number the first source of the result gets:
	 * the sources of a run are numbered once, from the first one, so the
	 * answer cites [1], [2], [3]… whatever the step the sources came from.
	 */
	render(data: TData, firstSourceNumber: number): string;
}

/** A tool that only reads. */
export interface ReadTool<TArgs, TData> extends AssistantTool<TArgs, TData> {
	kind: 'read';
	/** The sources the data holds: the pages the answer may cite. */
	sources(data: TData): readonly RetrievedChunk[];
}

/**
 * A read tool of the registry, whatever its arguments and its data are.
 *
 * The registry holds tools of different shapes, and the shapes do not mix: the
 * arguments of one tool are not the arguments of another. The registry erases
 * them, and the schema of the tool parses them again before the work.
 */
export type AnyReadTool = ReadTool<unknown, unknown>;

/** A tool that writes. It waits for a human before it does. */
export interface WriteTool<TArgs, TData> extends AssistantTool<TArgs, TData> {
	kind: 'write';
	run(ctx: WriteToolContext, args: TArgs): Promise<ToolResult<TData>>;
}
