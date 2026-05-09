#!/usr/bin/env node
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');

const ENV_FILES = [
  resolve(APP_ROOT, '.env.local'),
  resolve(APP_ROOT, '.env'),
  resolve(APP_ROOT, '../../../.env.local'),
  resolve(APP_ROOT, '../../opposite-osiris/.env.local'),
  resolve(APP_ROOT, '../../opposite-osiris/.env'),
  resolve(APP_ROOT, '../../../infrastructure/baas/.env.local'),
];

for (const file of ENV_FILES) {
  if (!existsSync(file)) continue;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...valueParts] = line.split('=');
    let value = valueParts.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const DEFAULT_BRIDGE_URL = `http://localhost:${process.env.OSIONOS_BRIDGE_PORT ?? '4000'}`;
const DEFAULT_API_URL = 'http://localhost:4200';
const SERVER_NAME = 'osionos-mcp';
const SERVER_VERSION = '0.1.0';
const TEXT_LIMIT = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cachedApiUrl = '';
let cachedSession = null;

function cleanUrl(value) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function unique(values) {
  return [...new Set(values.map(cleanUrl).filter(Boolean))];
}

function bridgeUrl() {
  return cleanUrl(process.env.OSIONOS_MCP_BRIDGE_URL ?? DEFAULT_BRIDGE_URL);
}

function configuredApiCandidates() {
  return unique([
    process.env.OSIONOS_MCP_API_URL,
    process.env.OSIONOS_API_URL,
    process.env.NOTION_API_URL,
    DEFAULT_API_URL,
    process.env.VITE_API_URL,
  ]);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]));
  return `{${entries.join(',')}}`;
}

function uuidFromHash(value) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function bridgeIdentity() {
  const email = String(process.env.OSIONOS_MCP_EMAIL ?? 'claude.mcp@osionos.local').trim().toLowerCase();
  const name = String(process.env.OSIONOS_MCP_NAME ?? 'Claude MCP').trim() || 'Claude MCP';
  const subject = String(process.env.OSIONOS_MCP_SUBJECT ?? uuidFromHash(`osionos-mcp:${email}`)).trim();
  return { provider: 'prismatica', subject, email, name };
}

function bridgeSecret() {
  return bridgeSecrets()[0] ?? '';
}

function bridgeSecrets() {
  return unique([
    process.env.OSIONOS_MCP_BRIDGE_SECRET,
    process.env.OSIONOS_BRIDGE_SHARED_SECRET,
    process.env.JWT_SECRET,
    'dev-secret-change-in-production',
  ]);
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const { response, text } = await fetchText(url, options);
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (typeof body === 'object' && body && 'error' in body) message = body.error;
    else if (typeof body === 'object' && body && 'message' in body) message = body.message;
    const error = new Error(String(message));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function probeJson(url) {
  try {
    const body = await fetchJson(url, { timeoutMs: 1_500 });
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error.status, message: error instanceof Error ? error.message : 'unreachable' };
  }
}

async function resolveApiUrl() {
  if (cachedApiUrl) return cachedApiUrl;
  const candidates = configuredApiCandidates();
  for (const candidate of candidates) {
    const health = await probeJson(`${candidate}/health`);
    if (!health.ok || !health.body || typeof health.body !== 'object') continue;
    if (health.body.service === 'osionos-bridge') continue;
    cachedApiUrl = candidate;
    return cachedApiUrl;
  }
  return candidates[0] ?? DEFAULT_API_URL;
}

function tokenExpiresAt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return 0;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return Number(payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

async function apiSession() {
  const envJwt = String(process.env.OSIONOS_MCP_JWT ?? '').trim();
  if (envJwt) return envJwt;
  if (cachedSession?.accessToken && cachedSession.expiresAt > Date.now() + 30_000) return cachedSession.accessToken;
  const secrets = bridgeSecrets();
  if (secrets.length === 0) {
    throw new Error('OSIONOS_BRIDGE_SHARED_SECRET or JWT_SECRET is required for local MCP API sessions.');
  }
  const body = bridgeIdentity();
  const apiUrl = await resolveApiUrl();
  let payload = null;
  let lastAuthError = null;
  for (const secret of secrets) {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret).update(`${timestamp}.${stableStringify(body)}`).digest('hex');
    try {
      payload = await fetchJson(`${apiUrl}/api/auth/bridge/session`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Prismatica-Bridge-Timestamp': timestamp,
          'X-Prismatica-Bridge-Signature': signature,
        },
        body: JSON.stringify(body),
      });
      break;
    } catch (error) {
      lastAuthError = error;
      if (error?.status !== 401) throw error;
    }
  }
  if (!payload) throw lastAuthError ?? new Error('Unable to create an osionos MCP API session.');
  const accessToken = String(payload?.accessToken ?? '').trim();
  if (!accessToken) throw new Error('The osionos API bridge session did not return an access token.');
  cachedSession = {
    accessToken,
    refreshToken: String(payload?.refreshToken ?? ''),
    user: payload?.user ?? null,
    workspaces: Array.isArray(payload?.workspaces) ? payload.workspaces : [],
    expiresAt: tokenExpiresAt(accessToken) || Date.now() + 10 * 60 * 1000,
  };
  return accessToken;
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const apiUrl = await resolveApiUrl();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${await apiSession()}`;
  return fetchJson(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function compact(value) {
  return JSON.stringify(value, null, 2).slice(0, TEXT_LIMIT);
}

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : compact(value) }] };
}

function normalizeBlockType(type) {
  const allowed = new Set([
    'paragraph',
    'heading_1',
    'heading_2',
    'heading_3',
    'heading_4',
    'heading_5',
    'heading_6',
    'bulleted_list',
    'numbered_list',
    'to_do',
    'toggle',
    'quote',
    'callout',
    'code',
    'divider',
  ]);
  return allowed.has(type) ? type : 'paragraph';
}

function markdownLineToBlock(line, index) {
  const trimmed = line.trim();
  const id = `mcp-${Date.now().toString(36)}-${index}-${randomUUID().slice(0, 8)}`;
  if (!trimmed) return { id, type: 'paragraph', content: '' };
  const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
  if (heading) return { id, type: `heading_${heading[1].length}`, content: heading[2] };
  const todo = /^[-*]\s+\[([ xX])]\s+(.+)$/.exec(trimmed);
  if (todo) return { id, type: 'to_do', checked: todo[1].toLowerCase() === 'x', content: todo[2] };
  const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
  if (bullet) return { id, type: 'bulleted_list', content: bullet[1] };
  const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
  if (numbered) return { id, type: 'numbered_list', content: numbered[1] };
  const quote = /^>\s?(.+)$/.exec(trimmed);
  if (quote) return { id, type: 'quote', content: quote[1] };
  const divider = /^---+$/.exec(trimmed);
  if (divider) return { id, type: 'divider', content: '' };
  return { id, type: 'paragraph', content: line };
}

function textToBlocks(text, fallbackType = 'paragraph') {
  const lines = String(text ?? '').split(/\r?\n/);
  if (lines.length === 1 && fallbackType !== 'paragraph') {
    return [{ id: `mcp-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`, type: normalizeBlockType(fallbackType), content: lines[0] ?? '' }];
  }
  return lines.map((line, index) => markdownLineToBlock(line, index));
}

function pageText(page) {
  const blocks = Array.isArray(page?.content) ? page.content : [];
  return blocks.map((block) => String(block?.content ?? '')).join('\n');
}

function compactPage(page) {
  return {
    id: page?._id,
    title: page?.title,
    icon: page?.icon,
    workspaceId: page?.workspaceId,
    parentPageId: page?.parentPageId ?? null,
    databaseId: page?.databaseId ?? null,
    updatedAt: page?.updatedAt ?? page?.updated_at ?? page?.modifiedAt,
    archivedAt: page?.archivedAt ?? null,
  };
}

async function listPagesForWorkspace(workspaceId) {
  return apiRequest(`/api/pages/all?workspaceId=${encodeURIComponent(workspaceId)}`);
}

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  websiteUrl: 'https://github.com/Univers42/track-binocle',
});

server.registerResource('osionos-connection', 'osionos://connection', {
  title: 'osionos MCP Connection',
  description: 'Current local bridge/API configuration for the osionos MCP server.',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{
    uri: uri.toString(),
    mimeType: 'application/json',
    text: compact({
      server: SERVER_NAME,
      version: SERVER_VERSION,
      bridgeUrl: bridgeUrl(),
      apiCandidates: configuredApiCandidates(),
      identityEmail: bridgeIdentity().email,
      hasBridgeSecret: Boolean(bridgeSecret()),
      hasExplicitJwt: Boolean(process.env.OSIONOS_MCP_JWT),
    }),
  }],
}));

server.registerTool('osionos_status', {
  title: 'osionos Status',
  description: 'Check the local osionos bridge and API endpoints used by Claude MCP.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => {
  const bridgeHealth = await probeJson(`${bridgeUrl()}/api/auth/bridge/health`);
  const apiChecks = [];
  for (const candidate of configuredApiCandidates()) {
    apiChecks.push({ url: candidate, health: await probeJson(`${candidate}/health`) });
  }
  const resolvedApiUrl = await resolveApiUrl();
  return textResult({
    ok: true,
    bridge: { url: bridgeUrl(), ...bridgeHealth },
    api: { resolvedUrl: resolvedApiUrl, candidates: apiChecks },
    auth: {
      mode: process.env.OSIONOS_MCP_JWT ? 'explicit-jwt' : 'signed-bridge-session',
      identityEmail: bridgeIdentity().email,
      hasBridgeSecret: Boolean(bridgeSecret()),
    },
    note: 'Claude Code uses this local stdio MCP server. Claude web/mobile connectors need a hosted HTTPS MCP endpoint with OAuth.',
  });
});

server.registerTool('osionos_list_workspaces', {
  title: 'List osionos Workspaces',
  description: 'List workspaces visible to the local Claude MCP osionos identity.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => {
  const workspaces = await apiRequest('/api/workspaces');
  return textResult({ workspaces });
});

server.registerTool('osionos_list_pages', {
  title: 'List osionos Pages',
  description: 'List pages in a workspace, optionally filtering by text in the page title or content.',
  inputSchema: {
    workspaceId: z.string().min(1).describe('Workspace ObjectId.'),
    query: z.string().optional().describe('Optional case-insensitive title/content filter.'),
    limit: z.number().int().min(1).max(100).default(50),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ workspaceId, query = '', limit = 50 }) => {
  const pages = await listPagesForWorkspace(workspaceId);
  const needle = query.trim().toLowerCase();
  const filtered = (Array.isArray(pages) ? pages : [])
    .filter((page) => !needle || `${page?.title ?? ''}\n${pageText(page)}`.toLowerCase().includes(needle))
    .slice(0, limit)
    .map(compactPage);
  return textResult({ workspaceId, count: filtered.length, pages: filtered });
});

server.registerTool('osionos_search_pages', {
  title: 'Search osionos Pages',
  description: 'Search page titles and inline page content across one workspace or all visible workspaces.',
  inputSchema: {
    query: z.string().min(1),
    workspaceId: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ query, workspaceId, limit = 25 }) => {
  const workspaces = workspaceId ? [{ _id: workspaceId }] : await apiRequest('/api/workspaces');
  const needle = query.trim().toLowerCase();
  const matches = [];
  for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
    const pages = await listPagesForWorkspace(String(workspace._id));
    for (const page of Array.isArray(pages) ? pages : []) {
      const haystack = `${page?.title ?? ''}\n${pageText(page)}`.toLowerCase();
      if (haystack.includes(needle)) matches.push(compactPage(page));
      if (matches.length >= limit) break;
    }
    if (matches.length >= limit) break;
  }
  return textResult({ query, count: matches.length, pages: matches });
});

server.registerTool('osionos_read_page', {
  title: 'Read osionos Page',
  description: 'Read a page and its standalone blocks from osionos.',
  inputSchema: {
    pageId: z.string().min(1),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ pageId }) => {
  const page = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`);
  const blocks = await apiRequest(`/api/blocks?pageId=${encodeURIComponent(pageId)}`).catch(() => []);
  return textResult({ page, blocks });
});

server.registerTool('osionos_create_page', {
  title: 'Create osionos Page',
  description: 'Create a new osionos page in a workspace using markdown-like text or explicit block content.',
  inputSchema: {
    workspaceId: z.string().min(1),
    title: z.string().min(1).default('Untitled'),
    text: z.string().optional().describe('Markdown-like text converted into osionos blocks.'),
    content: z.array(z.unknown()).optional().describe('Explicit osionos block array. Overrides text when provided.'),
    parentPageId: z.string().optional(),
    icon: z.string().optional(),
    cover: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ workspaceId, title, text, content, parentPageId, icon, cover }) => {
  const page = await apiRequest('/api/pages', {
    method: 'POST',
    body: {
      workspaceId,
      title,
      parentPageId: parentPageId || undefined,
      icon: icon || undefined,
      cover: cover || undefined,
      content: Array.isArray(content) ? content : textToBlocks(text ?? ''),
    },
  });
  return textResult({ created: compactPage(page), page });
});

server.registerTool('osionos_update_page', {
  title: 'Update osionos Page',
  description: 'Update page metadata and optionally replace page content.',
  inputSchema: {
    pageId: z.string().min(1),
    title: z.string().optional(),
    icon: z.string().optional(),
    cover: z.string().optional(),
    text: z.string().optional().describe('Markdown-like replacement content.'),
    content: z.array(z.unknown()).optional().describe('Explicit replacement osionos block array.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ pageId, title, icon, cover, text, content }) => {
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (icon !== undefined) patch.icon = icon;
  if (cover !== undefined) patch.cover = cover;
  if (Array.isArray(content)) patch.content = content;
  else if (text !== undefined) patch.content = textToBlocks(text);
  const page = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, { method: 'PATCH', body: patch });
  return textResult({ updated: compactPage(page), page });
});

server.registerTool('osionos_append_to_page', {
  title: 'Append to osionos Page',
  description: 'Append markdown-like text to an existing osionos page content array.',
  inputSchema: {
    pageId: z.string().min(1),
    text: z.string().min(1),
    blockType: z.string().optional().describe('Optional single-line block type override, such as paragraph, quote, callout, or code.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ pageId, text, blockType }) => {
  const current = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`);
  const existing = Array.isArray(current?.content) ? current.content : [];
  const appendedBlocks = textToBlocks(text, blockType);
  const page = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: 'PATCH',
    body: { content: [...existing, ...appendedBlocks] },
  });
  return textResult({ appendedBlocks: appendedBlocks.length, page: compactPage(page) });
});

server.registerTool('osionos_archive_page', {
  title: 'Archive osionos Page',
  description: 'Soft-delete/archive a page in osionos.',
  inputSchema: {
    pageId: z.string().min(1),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}, async ({ pageId }) => {
  const result = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, { method: 'DELETE' });
  return textResult({ archived: pageId, result });
});

server.registerPrompt('write_osionos_page', {
  title: 'Write osionos Page',
  description: 'Draft a page for osionos and then create it with osionos_create_page.',
  argsSchema: {
    topic: z.string().min(1),
    workspaceId: z.string().min(1),
  },
}, ({ topic, workspaceId }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Draft a concise osionos page about "${topic}". When ready, call osionos_create_page with workspaceId "${workspaceId}" and markdown-like text content.`,
    },
  }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);