import { handleApprovalDecision, handleApprovalGet, handleApprovalList, handleApprovalResume, handleApprovalUndo } from './approvals.ts';
import { handleAppliedList } from './appliedList.ts';
import { handleTurnUndo } from './turnUndo.ts';
import type { RouteEntry } from './types.ts';

/**
 * The approval routes, split out of table.ts to keep it under the file limit.
 * The patterns do not overlap any other entry, so their place in the table
 * does not change which route answers.
 */
export const APPROVAL_ROUTES: RouteEntry[] = [
	{ methods: ['GET'], pattern: /^\/api\/ai\/approvals$/, label: '/api/ai/approvals', handle: handleApprovalList },
	{ methods: ['GET'], pattern: /^\/api\/ai\/approvals\/([^/]+)$/, label: '/api/ai/approvals/:id', handle: handleApprovalGet },
	{ methods: ['POST'], pattern: /^\/api\/ai\/approvals\/([^/]+)$/, label: '/api/ai/approvals/:id', handle: handleApprovalDecision },
	{ methods: ['POST'], pattern: /^\/api\/ai\/approvals\/([^/]+)\/resume$/, label: '/api/ai/approvals/:id/resume', handle: handleApprovalResume },
	{ methods: ['POST'], pattern: /^\/api\/ai\/approvals\/([^/]+)\/undo$/, label: '/api/ai/approvals/:id/undo', handle: handleApprovalUndo },
	{ methods: ['POST'], pattern: /^\/api\/ai\/runs\/([^/]+)\/undo-writes$/, label: '/api/ai/runs/:id/undo-writes', handle: handleTurnUndo },
	// Auto-applied writes of a conversation (AM19): anchored, so `/conversations/:id` cannot answer it.
	{ methods: ['GET'], pattern: /^\/api\/ai\/conversations\/([^/]+)\/applied$/, label: '/api/ai/conversations/:id/applied', handle: handleAppliedList },
];
