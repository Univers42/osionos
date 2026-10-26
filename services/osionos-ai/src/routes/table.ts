import { config } from '../config.ts';
import { handleHealth } from './health.ts';
import { handleConversationItem, handleConversationMessages, handleConversationSummary, handleConversations } from './conversations.ts';
import { handleModels } from './models.ts';
import { handleCommands } from './commands.ts';
import { handleAgents } from './agents.ts';
import { handleAgentSettings } from './agentSettings.ts';
import { handleWebSettings } from './webSettings.ts';
import { handleAgentGet } from './agentsRead.ts';
import { handleAgentArchive, handleAgentCreate, handleAgentUpdate } from './agentsWrite.ts';
import { handleComplete } from './complete.ts';
import { handleVoiceTranscribe } from './voice.ts';
import { handleImages } from './images.ts';
import { handleMediaDescribe } from './mediaDescribe.ts';
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
import { handleSources } from './sources.ts';
import { handleApprovalDecision, handleApprovalGet, handleApprovalList, handleApprovalResume, handleApprovalUndo } from './approvals.ts';
import { handleSentimentMood, handleSentimentPulse } from './sentimentPulse.ts';
import { handleSentimentRows } from './sentimentRows.ts';
import { handleSentimentSettings } from './sentimentSettings.ts';
import { handleAccessTokenDelete, handleAccessTokens } from './accessTokens.ts';
import { handleSkillArchive, handleSkillCreate, handleSkillsList, handleSkillUpdate } from './skills.ts';
import {
	handleMemoriesList,
	handleMemoryApprove,
	handleMemoryArchive,
	handleMemoryEdit,
	handleMemoryReject,
} from './memories.ts';
import { handleMcp } from './mcp.ts';
import { handleMcpDiscover, handleMcpServerItem, handleMcpServers, handleMcpTool } from './mcpServers.ts';
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
		methods: ['DELETE'],
		pattern: /^\/api\/ai\/conversations\/([^/]+)\/summary$/,
		label: '/api/ai/conversations/:id/summary',
		handle: handleConversationSummary,
	},
	{
		methods: ['PATCH', 'DELETE'],
		pattern: /^\/api\/ai\/conversations\/([^/]+)$/,
		label: '/api/ai/conversations/:id',
		handle: handleConversationItem,
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
	{ methods: ['POST'], pattern: /^\/api\/ai\/sources$/, label: '/api/ai/sources', handle: handleSources },
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
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/media\/describe$/,
		label: '/api/ai/media/describe',
		handle: handleMediaDescribe,
	},
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
		pattern: /^\/api\/ai\/approvals$/,
		label: '/api/ai/approvals',
		handle: handleApprovalList,
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
	{ methods: ['GET'], pattern: /^\/api\/ai\/workspaces\/([^/]+)\/memories$/, label: '/api/ai/workspaces/:ws/memories', handle: handleMemoriesList },
	{ methods: ['POST'], pattern: /^\/api\/ai\/memories\/([^/]+)\/approve$/, label: '/api/ai/memories/:id/approve', handle: handleMemoryApprove },
	{ methods: ['POST'], pattern: /^\/api\/ai\/memories\/([^/]+)\/reject$/, label: '/api/ai/memories/:id/reject', handle: handleMemoryReject },
	{ methods: ['POST'], pattern: /^\/api\/ai\/memories\/([^/]+)\/archive$/, label: '/api/ai/memories/:id/archive', handle: handleMemoryArchive },
	{ methods: ['PATCH'], pattern: /^\/api\/ai\/memories\/([^/]+)$/, label: '/api/ai/memories/:id', handle: handleMemoryEdit },
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/approvals\/([^/]+)\/resume$/,
		label: '/api/ai/approvals/:id/resume',
		handle: handleApprovalResume,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/approvals\/([^/]+)\/undo$/,
		label: '/api/ai/approvals/:id/undo',
		handle: handleApprovalUndo,
	},
	{
		methods: [],
		pattern: /^\/api\/ai\/workspaces\/([^/]+)\/sentiment\/settings$/,
		label: '/api/ai/workspaces/:workspaceId/sentiment/settings',
		handle: handleSentimentSettings,
		anyMethod: true,
	},
	{ methods: ['GET'], pattern: /^\/api\/ai\/workspaces\/([^/]+)\/skills$/, label: '/api/ai/workspaces/:ws/skills', handle: handleSkillsList },
	{ methods: ['POST'], pattern: /^\/api\/ai\/workspaces\/([^/]+)\/skills$/, label: '/api/ai/workspaces/:ws/skills', handle: handleSkillCreate },
	{ methods: ['PUT'], pattern: /^\/api\/ai\/workspaces\/([^/]+)\/skills\/([^/]+)$/, label: '/api/ai/workspaces/:ws/skills/:slug', handle: handleSkillUpdate },
	{ methods: ['DELETE'], pattern: /^\/api\/ai\/workspaces\/([^/]+)\/skills\/([^/]+)$/, label: '/api/ai/workspaces/:ws/skills/:slug', handle: handleSkillArchive },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/workspaces\/([^/]+)\/sentiment\/pulse$/,
		label: '/api/ai/workspaces/:workspaceId/sentiment/pulse',
		handle: handleSentimentPulse,
	},
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/pages\/([^/]+)\/sentiment\/mood$/,
		label: '/api/ai/pages/:pageId/sentiment/mood',
		handle: handleSentimentMood,
	},
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/sentiment\/rows$/,
		label: '/api/ai/sentiment/rows',
		handle: handleSentimentRows,
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
			// The remote MCP endpoint: PAT only, read only (G4b-1).
			{ methods: [], pattern: /^\/api\/ai\/mcp$/, label: '/api/ai/mcp', handle: handleMcp, anyMethod: true },
		]
		: []),
	// Custom agents (C329): off, these paths do not exist either.
	...(config.customAgentsEnabled
		? [
			{ methods: ['POST'], pattern: /^\/api\/ai\/agents$/, label: '/api/ai/agents', handle: handleAgentCreate },
			{ methods: ['GET'], pattern: /^\/api\/ai\/agents\/([^/]+)$/, label: '/api/ai/agents/:id', handle: handleAgentGet },
			{ methods: ['PATCH'], pattern: /^\/api\/ai\/agents\/([^/]+)$/, label: '/api/ai/agents/:id', handle: handleAgentUpdate },
			{ methods: ['DELETE'], pattern: /^\/api\/ai\/agents\/([^/]+)$/, label: '/api/ai/agents/:id', handle: handleAgentArchive },
			{
				methods: [],
				pattern: /^\/api\/ai\/workspaces\/([^/]+)\/agents\/settings$/,
				label: '/api/ai/workspaces/:ws/agents/settings',
				handle: handleAgentSettings,
				anyMethod: true,
			},
		]
		: []),
	// The web tools (C369): off, the switch of a workspace does not exist either.
	...(config.webEnabled
		? [
			{
				methods: [],
				pattern: /^\/api\/ai\/workspaces\/([^/]+)\/web\/settings$/,
				label: '/api/ai/workspaces/:ws/web/settings',
				handle: handleWebSettings,
				anyMethod: true,
			},
		]
		: []),
	// The MCP client: the servers a user registers. Off, these paths do not
	// exist: the router's own 404, the same as any unknown path (C288).
	...(config.mcpClientEnabled
		? [
			{
				methods: [],
				pattern: /^\/api\/ai\/mcp-servers$/,
				label: '/api/ai/mcp-servers',
				handle: handleMcpServers,
				anyMethod: true,
			},
			{
				methods: ['PATCH', 'DELETE'],
				pattern: /^\/api\/ai\/mcp-servers\/([^/]+)$/,
				label: '/api/ai/mcp-servers/:id',
				handle: handleMcpServerItem,
			},
			{
				methods: ['POST'],
				pattern: /^\/api\/ai\/mcp-servers\/([^/]+)\/discover$/,
				label: '/api/ai/mcp-servers/:id/discover',
				handle: handleMcpDiscover,
			},
			{
				methods: ['PATCH'],
				pattern: /^\/api\/ai\/mcp-servers\/([^/]+)\/tools\/([^/]+)$/,
				label: '/api/ai/mcp-servers/:id/tools/:name',
				handle: handleMcpTool,
			},
		]
		: []),
];
