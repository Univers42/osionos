import { config } from '../config.ts';
import { handleHealth } from './health.ts';
import { handleConversationMessages, handleConversations } from './conversations.ts';
import { handleModels } from './models.ts';
import { handleCommands } from './commands.ts';
import { handleAgents } from './agents.ts';
import { handleComplete } from './complete.ts';
import { handleVoiceTranscribe } from './voice.ts';
import { handleImages } from './images.ts';
import { handleRunCancel, handleRunEvents, handleRuns } from './runs.ts';
import {
	handleConnectionDelete,
	handleConnections,
	handleConnectionTest,
	handleOAuthComplete,
	handleOAuthStart,
	handleProviders,
} from './connections.ts';
import { handleUsage } from './usage.ts';
import { handleRelated } from './related.ts';
import { handleApprovalDecision, handleApprovalGet } from './approvals.ts';
import { handleAccessTokenDelete, handleAccessTokens } from './accessTokens.ts';
import type { RouteEntry } from './types.ts';

/**
 * The dispatch table.
 *
 * The first entry whose pattern matches the path AND whose methods carry the
 * request's method answers. A path that matches with another method is a 404,
 * except for the routes that say otherwise.
 */
export const ROUTES: RouteEntry[] = [
	{ methods: ['GET'], pattern: /^\/api\/ai\/health$/, label: '/api/ai/health', handle: handleHealth },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/conversations\/([^/]+)\/messages$/,
		label: '/api/ai/conversations/:id/messages',
		handle: handleConversationMessages,
	},
	{
		methods: [],
		pattern: /^\/api\/ai\/conversations$/,
		label: '/api/ai/conversations',
		handle: handleConversations,
		anyMethod: true,
	},
	{ methods: ['GET'], pattern: /^\/api\/ai\/models$/, label: '/api/ai/models', handle: handleModels },
	{ methods: ['GET'], pattern: /^\/api\/ai\/commands$/, label: '/api/ai/commands', handle: handleCommands },
	{ methods: ['GET'], pattern: /^\/api\/ai\/agents$/, label: '/api/ai/agents', handle: handleAgents },
	{ methods: ['GET'], pattern: /^\/api\/ai\/providers$/, label: '/api/ai/providers', handle: handleProviders },
	{ methods: ['GET'], pattern: /^\/api\/ai\/usage$/, label: '/api/ai/usage', handle: handleUsage },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/pages\/([^/]+)\/related$/,
		label: '/api/ai/pages/:id/related',
		handle: handleRelated,
	},
	{
		methods: [],
		pattern: /^\/api\/ai\/connections$/,
		label: '/api/ai/connections',
		handle: handleConnections,
		anyMethod: true,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/connections\/oauth\/openrouter\/start$/,
		label: '/api/ai/connections/oauth/openrouter/start',
		handle: handleOAuthStart,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/connections\/oauth\/openrouter\/complete$/,
		label: '/api/ai/connections/oauth/openrouter/complete',
		handle: handleOAuthComplete,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/connections\/([^/]+)\/test$/,
		label: '/api/ai/connections/:id/test',
		handle: handleConnectionTest,
	},
	{
		methods: ['DELETE'],
		pattern: /^\/api\/ai\/connections\/([^/]+)$/,
		label: '/api/ai/connections/:id',
		handle: handleConnectionDelete,
	},
	{ methods: ['POST'], pattern: /^\/api\/ai\/complete$/, label: '/api/ai/complete', handle: handleComplete },
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/voice\/transcribe$/,
		label: '/api/ai/voice/transcribe',
		handle: handleVoiceTranscribe,
	},
	{ methods: ['POST'], pattern: /^\/api\/ai\/images$/, label: '/api/ai/images', handle: handleImages },
	{ methods: ['POST'], pattern: /^\/api\/ai\/runs$/, label: '/api/ai/runs', handle: handleRuns },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/runs\/([^/]+)\/events$/,
		label: '/api/ai/runs/:id/events',
		handle: handleRunEvents,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/runs\/([^/]+)\/cancel$/,
		label: '/api/ai/runs/:id/cancel',
		handle: handleRunCancel,
	},
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/approvals\/([^/]+)$/,
		label: '/api/ai/approvals/:id',
		handle: handleApprovalGet,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/approvals\/([^/]+)$/,
		label: '/api/ai/approvals/:id',
		handle: handleApprovalDecision,
	},
	// Off, the access-token paths do not exist: the router's own 404 (R-C4).
	...(config.patEnabled
		? [
			{
				methods: [],
				pattern: /^\/api\/ai\/access-tokens$/,
				label: '/api/ai/access-tokens',
				handle: handleAccessTokens,
				anyMethod: true,
			},
			{
				methods: ['DELETE'],
				pattern: /^\/api\/ai\/access-tokens\/([^/]+)$/,
				label: '/api/ai/access-tokens/:id',
				handle: handleAccessTokenDelete,
			},
		]
		: []),
];
