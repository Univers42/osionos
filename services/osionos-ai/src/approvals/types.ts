import type { QueryResultRow } from 'pg';

/**
 * The approvals: a write the assistant asked for, and the human who decides
 * it.
 *
 * The row IS the state. A run that asks for the right to write ends TERMINAL —
 * it did its job — and the approval row is what waits: the run may be finished
 * while the question is still open.
 *
 * The write tool never writes. It validates the arguments, stores them, and
 * asks. The write happens when the user decides, with the token of THAT
 * request: no token is ever stored in a row, an event or a log line.
 */

/** The states of an approval. */
export type ApprovalStatus =
	| 'pending'
	| 'executing'
	| 'executed'
	| 'failed'
	| 'declined'
	| 'expired'
	| 'unknown';

/** The row of an approval: what the user is asked, and what became of it. */
export interface ApprovalRow extends QueryResultRow {
	id: string;
	run_id: string;
	conversation_id: string;
	owner_id: string;
	workspace_id: string;
	tool: string;
	/** The arguments, exactly as they will be written. */
	args: Record<string, unknown>;
	/** The hash of the arguments: the duplicate key of the approval. */
	args_sha256: string;
	status: ApprovalStatus;
	/** The outcome of the write: a short result, nothing more. */
	result: unknown;
	/** The reason of a failure: a safe message, never an internal. */
	error: string | null;
	created_at: Date;
	decided_at: Date | null;
	expires_at: Date;
}

/**
 * The target of a write: the page, the title and the workspace.
 *
 * The card shows the target by NAME: a page id alone tells the user nothing,
 * and the workspace it lands in is half of the question.
 */
export interface ApprovalTarget {
	/** The page the write touches, when it touches one. */
	pageId?: string;
	/** The title the card shows: the new one for a rename, the current one otherwise. */
	title: string;
	/** The workspace the write lands in. */
	workspaceId: string;
	/** The name of that workspace, when the database knows it. */
	workspaceName: string;
}

/** What the preview of a write counts: the blocks of a page, or its sub-pages. */
export type PreviewUnit = 'blocks' | 'sub_pages' | 'none';

/** The preview of a write: a number, and what the number is. */
export interface ApprovalPreview {
	unit: PreviewUnit;
	count: number;
}

/** The plan of a write: the arguments, the target, and the preview. */
export interface ApprovalPlan {
	/** The arguments, exactly as they will be written. */
	args: Record<string, unknown>;
	/** What the card shows of the target. */
	target: ApprovalTarget;
	/** What the card shows of the scope of the write. */
	preview: ApprovalPreview;
}

/**
 * What the write tools of a run need to know about that run.
 *
 * The run owns the approval: the row carries the run, the conversation and
 * the owner, and the provenance says where the request comes from.
 */
export interface ApprovalContext {
	/** The run the request belongs to. */
	runId: string;
	/** The conversation the run answers in. */
	conversationId: string;
	/** The caller: the only one who may decide. */
	ownerId: string;
	/**
	 * The pages the run had read or quoted.
	 *
	 * It is a function, not a list: the run reads more pages as it goes, and
	 * the provenance of an approval is what the run had seen WHEN it asked.
	 */
	provenance(): readonly string[];
}

/**
 * The event a run emits when it asks the user for the right to write.
 *
 * It is the DATA of the card: the tool in words, the target by name, every
 * argument verbatim, the scope of the write, the pages the run had read or
 * quoted (the provenance), and the number of the writes this run has already
 * had approved. The card itself is another brief.
 */
export interface PermissionAsked {
	/** The id of the approval: the card asks for it. */
	approvalId: string;
	/** The name of the tool the model called. */
	tool: string;
	/** The verb of the card, in plain words. */
	verb: string;
	/** The target of the write. */
	target: ApprovalTarget;
	/** The arguments, exactly as they will be written. */
	args: Record<string, unknown>;
	/** The scope of the write. */
	preview: ApprovalPreview;
	/** The pages the run had read or quoted: where the request comes from. */
	provenance: { pageIds: string[] };
	/** The number of the writes of this run that are already approved. */
	approvedInRun: number;
	/** When the question closes itself. */
	expiresAt: string;
}
