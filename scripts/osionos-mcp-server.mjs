/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-mcp-server.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
  resolve(APP_ROOT, '../../../apps/baas/.env.local'),
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
const DEFAULT_API_URL = DEFAULT_BRIDGE_URL;
const SERVER_NAME = 'osionos-mcp';
const SERVER_VERSION = '0.1.0';
const TEXT_LIMIT = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const BLOCK_TYPES = [
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
  'image',
  'video',
  'audio',
  'file',
  'code',
  'quote',
  'callout',
  'equation',
  'layout',
  'column_list',
  'column',
  'divider',
  'table_block',
  'database_inline',
  'database_full_page',
];
const BLOCK_TYPE_SET = new Set(BLOCK_TYPES);
const SLASH_BLOCK_COMMANDS = [
  { command: '/page', kind: 'create-page', description: 'Create a page and link it from the current block.' },
  { command: '/text', type: 'paragraph', description: 'Plain paragraph text.' },
  { command: '/h1', type: 'heading_1', description: 'Large heading.' },
  { command: '/h2', type: 'heading_2', description: 'Medium heading.' },
  { command: '/h3', type: 'heading_3', description: 'Small heading.' },
  { command: '/h4', type: 'heading_4', description: 'Section heading.' },
  { command: '/h5', type: 'heading_5', description: 'Compact heading.' },
  { command: '/h6', type: 'heading_6', description: 'Micro heading.' },
  { command: '/bullet', type: 'bulleted_list', description: 'Bulleted list item.' },
  { command: '/number', type: 'numbered_list', description: 'Numbered list item.' },
  { command: '/todo', type: 'to_do', description: 'Checkbox item. Use [x] to mark complete.' },
  { command: '/toggle', type: 'toggle', description: 'Collapsible content with optional nested children.' },
  { command: '/quote', type: 'quote', description: 'Block quote.' },
  { command: '/callout', type: 'callout', description: 'Callout with color/icon metadata.' },
  { command: '/code', type: 'code', description: 'Code block with language metadata.' },
  { command: '/equation', type: 'equation', description: 'LaTeX display equation.' },
  { command: '/columns', type: 'column_list', description: 'Side-by-side columns with nested column children.' },
  { command: '/layout', type: 'layout', description: 'Inline or full-page grid layout canvas.' },
  { command: '/divider', type: 'divider', description: 'Horizontal divider.' },
  { command: '/table', type: 'table_block', description: 'Simple table using tableData rows.' },
  { command: '/image', type: 'image', description: 'Image media block. Use asset as url:<https-url>.' },
  { command: '/video', type: 'video', description: 'Video media block. Use asset as url:<https-url>.' },
  { command: '/audio', type: 'audio', description: 'Audio media block. Use asset as url:<https-url>.' },
  { command: '/file', type: 'file', description: 'File media block. Use asset as url:<https-url>.' },
  { command: '/database-inline', type: 'database_inline', description: 'Inline database view with databaseId and viewId.' },
  { command: '/database-full-page', type: 'database_full_page', description: 'Framed full-page database view with databaseId and viewId.' },
  { command: '/inline-equation', kind: 'inline', description: 'Inline text syntax: $E = mc^2$ inside a paragraph.' },
];
const RICH_BLOCK_GUIDE = [
  'Prefer explicit content arrays for complex osionos notes.',
  'Every block is { id?, type, content, ...metadata }. Missing ids are generated by the MCP server.',
  'Nested blocks go in children. Toggles, callouts, quotes, lists, column_list, and column can carry children.',
  'Code blocks use language. To-dos use checked. Tables use tableData. Media blocks use asset, usually url:<https-url>.',
  'Database blocks use databaseId and optional viewId. Layout blocks use layoutMode, layoutConfig, and layoutCells.',
  'Text also supports markdown headings, bullets, numbered lists, todos, quotes, dividers, fenced code, pipe tables, and simple slash directives.',
].join('\n');
const RICH_BLOCK_EXAMPLE = [
  { type: 'heading_1', content: 'How osionos works' },
  { type: 'paragraph', content: 'The app is a Notion-like workspace backed by pages, blocks, databases, views, and a local Claude MCP bridge.' },
  { type: 'callout', content: 'Claude can read the workspace first, then create or update pages through MCP tools.', color: '!' },
  { type: 'toggle', content: 'Open the data flow', children: [
    { type: 'numbered_list', content: 'Agent page sends a prompt to the local bridge.' },
    { type: 'numbered_list', content: 'Claude Code receives the prompt and may call osionos MCP tools.' },
    { type: 'numbered_list', content: 'The MCP server signs into the local API through the bridge session.' },
    { type: 'numbered_list', content: 'Pages are returned as block arrays and rendered by the editor.' },
  ] },
  { type: 'code', language: 'typescript', content: 'type Block = { id: string; type: BlockType; content: string; children?: Block[] }' },
  { type: 'table_block', content: '', tableData: [
    ['Layer', 'Responsibility'],
    ['Agent page', 'Chat UI, model/effort/tools, stream rendering'],
    ['Bridge API', 'SSE wrapper around Claude Code'],
    ['MCP server', 'Workspace/page/database tools'],
  ] },
  { type: 'column_list', content: '', children: [
    { type: 'column', content: '', widthRatio: 0.5, children: [{ type: 'bulleted_list', content: 'Pages are trees of blocks' }] },
    { type: 'column', content: '', widthRatio: 0.5, children: [{ type: 'bulleted_list', content: 'Databases render table, board, gallery, calendar, and graph views' }] },
  ] },
  { type: 'equation', content: 'workspace + pages + blocks + views = osionos' },
  { type: 'divider', content: '' },
];

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
    process.env.VITE_API_URL,
    bridgeUrl(),
    DEFAULT_API_URL,
    process.env.NOTION_API_URL,
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

function bridgeAssertion() {
  return { ...bridgeIdentity(), jti: randomUUID() };
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

async function probeApiCandidate(candidate) {
  const bridgeHealth = await probeJson(`${candidate}/api/auth/bridge/health`);
  if (bridgeHealth.ok && bridgeHealth.body?.service === 'osionos-bridge') {
    return { ok: true, kind: 'osionos-bridge', health: bridgeHealth };
  }
  const health = await probeJson(`${candidate}/health`);
  const service = typeof health.body?.service === 'string' ? health.body.service.toLowerCase() : '';
  if (health.ok && service.includes('osionos')) {
    return { ok: true, kind: service, health };
  }
  return { ok: false, health };
}

async function resolveApiUrl() {
  if (cachedApiUrl) return cachedApiUrl;
  const candidates = configuredApiCandidates();
  for (const candidate of candidates) {
    const probe = await probeApiCandidate(candidate);
    if (!probe.ok) continue;
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

function handoffTokenFromPayload(payload) {
  const directToken = String(payload?.token ?? payload?.bridgeToken ?? '').trim();
  if (directToken) return directToken;
  const redirectUrl = String(payload?.redirectUrl ?? '').trim();
  if (!redirectUrl) return '';
  try {
    const hash = new URL(redirectUrl).hash.replace(/^#/, '');
    return new URLSearchParams(hash).get('bridge_token') ?? '';
  } catch {
    return '';
  }
}

async function consumeBridgeHandoff(apiUrl, payload) {
  if (payload?.accessToken) return payload;
  if (payload?.session?.accessToken) return payload.session;
  const token = handoffTokenFromPayload(payload);
  if (!token) return payload;
  const consumed = await fetchJson(`${apiUrl}/api/auth/bridge/consume`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  return consumed?.session ?? consumed;
}

async function apiSession() {
  const envJwt = String(process.env.OSIONOS_MCP_JWT ?? '').trim();
  if (envJwt) return envJwt;
  if (cachedSession?.accessToken && cachedSession.expiresAt > Date.now() + 30_000) return cachedSession.accessToken;
  const secrets = bridgeSecrets();
  if (secrets.length === 0) {
    throw new Error('OSIONOS_BRIDGE_SHARED_SECRET or JWT_SECRET is required for local MCP API sessions.');
  }
  const body = bridgeAssertion();
  const apiUrl = await resolveApiUrl();
  let payload = null;
  let lastAuthError = null;
  for (const secret of secrets) {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret).update(`${timestamp}.${stableStringify(body)}`).digest('hex');
    try {
      const sessionPayload = await fetchJson(`${apiUrl}/api/auth/bridge/session`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Prismatica-Bridge-Timestamp': timestamp,
          'X-Prismatica-Bridge-Signature': signature,
        },
        body: JSON.stringify(body),
      });
      payload = await consumeBridgeHandoff(apiUrl, sessionPayload);
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

function blockId(index) {
  const suffix = index === undefined || index === null ? randomUUID().slice(0, 8) : `${index}-${randomUUID().slice(0, 8)}`;
  return `mcp-${Date.now().toString(36)}-${suffix}`;
}

function normalizeBlockType(type) {
  return BLOCK_TYPE_SET.has(type) ? type : 'paragraph';
}

function createBlock(type, content, extra, index) {
  const metadata = extra && typeof extra === 'object' ? extra : {};
  return {
    id: blockId(index),
    type: normalizeBlockType(type),
    content: String(content ?? ''),
    ...metadata,
  };
}

function normalizeChildren(value, prefix) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((child, index) => normalizeExplicitBlock(child, `${prefix}-${index}`))
    .filter(Boolean);
}

function normalizeTableData(value) {
  if (!Array.isArray(value)) return undefined;
  return value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [String(row ?? '')]);
}

function normalizeLayoutCells(value, prefix) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((cell) => cell && typeof cell === 'object')
    .map((cell, index) => {
      const record = cell;
      return {
        ...record,
        id: typeof record.id === 'string' ? record.id : blockId(`${prefix}-cell-${index}`),
        blocks: normalizeChildren(record.blocks, `${prefix}-cell-${index}`) ?? [],
      };
    });
}

function normalizeExplicitBlock(value, index) {
  if (!value || typeof value !== 'object') return null;
  const type = normalizeBlockType(value.type);
  const block = {
    ...value,
    id: typeof value.id === 'string' ? value.id : blockId(index),
    type,
    content: typeof value.content === 'string' ? value.content : '',
  };
  const children = normalizeChildren(value.children, index);
  if (children) block.children = children;
  const tableData = normalizeTableData(value.tableData);
  if (tableData) block.tableData = tableData;
  const layoutCells = normalizeLayoutCells(value.layoutCells, index);
  if (layoutCells) block.layoutCells = layoutCells;
  return block;
}

function normalizeExplicitBlocks(content) {
  return content
    .map((block, index) => normalizeExplicitBlock(block, index))
    .filter(Boolean);
}

function defaultLayoutConfig() {
  return {
    columns: 12,
    rows: 6,
    gap: 16,
    rowHeight: 120,
    wrap: true,
    autoArrange: false,
    snapToGrid: true,
    guideVisibility: 'auto',
    preview: false,
    theme: 'default',
  };
}

function parsePipeCells(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = withoutEdges.split('|').map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

function isPipeTableSeparator(line) {
  const cells = parsePipeCells(line);
  return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

const SIMPLE_SLASH_TYPES = new Map([
  ['text', 'paragraph'],
  ['p', 'paragraph'],
  ['paragraph', 'paragraph'],
  ['bullet', 'bulleted_list'],
  ['bulleted', 'bulleted_list'],
  ['bulleted_list', 'bulleted_list'],
  ['number', 'numbered_list'],
  ['numbered', 'numbered_list'],
  ['numbered_list', 'numbered_list'],
  ['quote', 'quote'],
]);

function mediaAssetFromSource(source) {
  if (!source) return '';
  return source.startsWith('url:') ? source : `url:${source}`;
}

function parseTodoSlash(rest, index) {
  const todo = /^\[([ xX])\]\s*(.*)$/.exec(rest.trim());
  return createBlock('to_do', todo ? todo[2] : rest, { checked: todo ? todo[1].toLowerCase() === 'x' : false }, index);
}

function parseCalloutSlash(rest, index) {
  const callout = /^(\S+)\s+(.+)$/.exec(rest.trim());
  return createBlock('callout', callout ? callout[2] : rest, { color: callout ? callout[1] : '!' }, index);
}

function parseCodeSlash(rest, index) {
  const code = /^(\S+)\s+([\s\S]+)$/.exec(rest.trim());
  return createBlock('code', code ? code[2] : rest, { language: code ? code[1] : 'plaintext' }, index);
}

function parseMediaSlash(command, rest, index) {
  const media = /^(\S+)\s*(.*)$/.exec(rest.trim());
  return createBlock(command, media?.[2] ?? '', { asset: mediaAssetFromSource(media?.[1] ?? ''), mediaWidth: 100 }, index);
}

function parseColumnsSlash(rest, index) {
  const parts = rest.split('|').map((part) => part.trim()).filter(Boolean);
  const columns = (parts.length ? parts : ['Left column', 'Right column']).slice(0, 5);
  return createBlock('column_list', '', {
    children: columns.map((content, columnIndex) => createBlock('column', '', {
      widthRatio: 1 / columns.length,
      children: [createBlock('paragraph', content, {}, `${index}-column-${columnIndex}`)],
    }, `${index}-column-${columnIndex}`)),
  }, index);
}

function parseLayoutSlash(rest, index) {
  return createBlock('layout', '', {
    layoutMode: rest.trim() === 'full_page' ? 'full_page' : 'inline',
    layoutConfig: defaultLayoutConfig(),
    layoutCells: [],
  }, index);
}

function parseDatabaseSlash(command, rest, index) {
  const [databaseId = '', viewId = ''] = rest.trim().split(/\s+/);
  const type = command.includes('full') ? 'database_full_page' : 'database_inline';
  return createBlock(type, '', { databaseId, viewId: viewId || undefined }, index);
}

function parseSlashDirective(line, index) {
  const match = /^\/(\S+)\s*(.*)$/.exec(line.trim());
  if (!match) return null;
  const command = match[1].toLowerCase();
  const rest = match[2] ?? '';
  if (SIMPLE_SLASH_TYPES.has(command)) return createBlock(SIMPLE_SLASH_TYPES.get(command), rest, {}, index);
  if (/^h[1-6]$/.test(command)) return createBlock(`heading_${command.slice(1)}`, rest, {}, index);
  if (/^heading_[1-6]$/.test(command)) return createBlock(command, rest, {}, index);
  if (['todo', 'to-do', 'to_do'].includes(command)) return parseTodoSlash(rest, index);
  if (command === 'toggle') return createBlock('toggle', rest, { collapsed: false, children: [] }, index);
  if (command === 'callout') return parseCalloutSlash(rest, index);
  if (command === 'divider') return createBlock('divider', '', {}, index);
  if (command === 'equation') return createBlock('equation', rest || 'E = mc^2', {}, index);
  if (command === 'code') return parseCodeSlash(rest, index);
  if (['image', 'video', 'audio', 'file'].includes(command)) return parseMediaSlash(command, rest, index);
  if (command === 'columns') return parseColumnsSlash(rest, index);
  if (command === 'layout') return parseLayoutSlash(rest, index);
  if (['database-inline', 'database_inline', 'database-full-page', 'database_full_page'].includes(command)) return parseDatabaseSlash(command, rest, index);
  return null;
}

function parseCodeFenceBlock(lines, startIndex, blockIndex) {
  const codeFence = /^```([\w+-]*)\s*$/.exec(lines[startIndex].trim());
  if (!codeFence) return null;
  const codeLines = [];
  let nextIndex = startIndex + 1;
  while (nextIndex < lines.length && !/^```\s*$/.test(lines[nextIndex].trim())) {
    codeLines.push(lines[nextIndex]);
    nextIndex += 1;
  }
  return {
    block: createBlock('code', codeLines.join('\n'), { language: codeFence[1] || 'plaintext' }, blockIndex),
    nextIndex: Math.min(nextIndex + 1, lines.length),
  };
}

function parsePipeTableBlock(lines, startIndex, blockIndex) {
  const cells = parsePipeCells(lines[startIndex]);
  if (!cells) return null;
  const tableData = [cells];
  let nextIndex = startIndex + 1;
  if (nextIndex < lines.length && isPipeTableSeparator(lines[nextIndex])) nextIndex += 1;
  while (nextIndex < lines.length) {
    const row = parsePipeCells(lines[nextIndex]);
    if (!row || isPipeTableSeparator(lines[nextIndex])) break;
    tableData.push(row);
    nextIndex += 1;
  }
  if (tableData.length <= 1) return null;
  return { block: createBlock('table_block', '', { tableData }, blockIndex), nextIndex };
}

function parseNextTextBlock(lines, startIndex, blockIndex) {
  return parseCodeFenceBlock(lines, startIndex, blockIndex)
    ?? parsePipeTableBlock(lines, startIndex, blockIndex)
    ?? { block: markdownLineToBlock(lines[startIndex], blockIndex), nextIndex: startIndex + 1 };
}

function markdownLineToBlock(line, index) {
  const trimmed = line.trim();
  if (!trimmed) return createBlock('paragraph', '', {}, index);
  const slashBlock = parseSlashDirective(trimmed, index);
  if (slashBlock) return slashBlock;
  const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
  if (heading) return createBlock(`heading_${heading[1].length}`, heading[2], {}, index);
  const todo = /^[-*]\s+\[([ xX])]\s+(.+)$/.exec(trimmed);
  if (todo) return createBlock('to_do', todo[2], { checked: todo[1].toLowerCase() === 'x' }, index);
  const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
  if (bullet) return createBlock('bulleted_list', bullet[1], {}, index);
  const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
  if (numbered) return createBlock('numbered_list', numbered[1], {}, index);
  const quote = /^>\s?(.+)$/.exec(trimmed);
  if (quote) return createBlock('quote', quote[1], {}, index);
  const divider = /^---+$/.exec(trimmed);
  if (divider) return createBlock('divider', '', {}, index);
  return createBlock('paragraph', line, {}, index);
}

function textToBlocks(text, fallbackType = 'paragraph') {
  const lines = String(text ?? '').split(/\r?\n/);
  if (lines.length === 1 && fallbackType !== 'paragraph') {
    return [createBlock(fallbackType, lines[0] ?? '')];
  }
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const parsed = parseNextTextBlock(lines, index, blocks.length);
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

function pageText(page) {
  const blocks = Array.isArray(page?.content) ? page.content : [];
  return blocks.map(blockText).join('\n');
}

function blockText(block) {
  if (!block || typeof block !== 'object') return '';
  const parts = [String(block.content ?? '')];
  if (Array.isArray(block.tableData)) {
    parts.push(block.tableData.map((row) => Array.isArray(row) ? row.join(' | ') : String(row ?? '')).join('\n'));
  }
  if (Array.isArray(block.children)) parts.push(block.children.map(blockText).join('\n'));
  if (Array.isArray(block.layoutCells)) {
    parts.push(block.layoutCells.map((cell) => Array.isArray(cell?.blocks) ? cell.blocks.map(blockText).join('\n') : '').join('\n'));
  }
  return parts.filter(Boolean).join('\n');
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

async function workspaceOverview(limit) {
  const workspaces = await apiRequest('/api/workspaces').catch(() => []);
  const overview = [];
  for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
    const pages = await listPagesForWorkspace(String(workspace._id)).catch(() => []);
    const visiblePages = Array.isArray(pages) ? pages.filter((page) => !page?.archivedAt) : [];
    overview.push({
      id: workspace._id,
      name: workspace.name,
      plan: workspace.plan,
      pageCount: visiblePages.length,
      pages: visiblePages.slice(0, limit).map(compactPage),
    });
  }
  return overview;
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
    apiChecks.push({ url: candidate, probe: await probeApiCandidate(candidate) });
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

server.registerTool('osionos_describe_app', {
  title: 'Describe osionos App',
  description: 'Explain how this osionos workspace app is structured, which slash/block elements exist, and how Claude should create rich pages.',
  inputSchema: {
    includeWorkspace: z.boolean().default(true).describe('Include visible workspace and page summaries.'),
    includeExamples: z.boolean().default(true).describe('Include a reusable explicit content array example.'),
    pageLimit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ includeWorkspace = true, includeExamples = true, pageLimit = 20 }) => {
  const workspace = includeWorkspace ? await workspaceOverview(pageLimit) : [];
  return textResult({
    app: {
      name: 'osionos playground',
      purpose: 'A Notion-like workspace/editor that combines pages, block trees, local-first Zustand state, database views, and Claude MCP actions.',
      frontend: ['React 19', 'Vite', 'Zustand page/auth stores', 'block editor and slash command menu', 'database view widgets'],
      contentFlow: [
        'MainContent routes active surfaces: home dashboard, database view, channel, agent conversation, or editable page.',
        'Editable pages store content as arrays of Block objects. Blocks can be nested through children.',
        'Database blocks reference databaseId/viewId and render the shared database-view widget.',
        'Agent pages stream Claude through /api/agent/claude/stream and display MCP tool traces.',
      ],
      mcpFlow: [
        'Claude Code connects to scripts/osionos-mcp-server.mjs over stdio.',
        'The MCP server signs into the local API through the bridge/session flow or uses OSIONOS_MCP_JWT.',
        'Tools list/read/search/create/update/archive pages through the local API.',
        'For app documentation, call osionos_describe_app first, inspect pages as needed, then create a page using explicit content blocks.',
      ],
    },
    blockSchema: {
      blockTypes: BLOCK_TYPES,
      richBlockGuide: RICH_BLOCK_GUIDE,
      importantFields: {
        common: ['id', 'type', 'content', 'children'],
        to_do: ['checked'],
        code: ['language'],
        callout: ['color', 'children'],
        media: ['asset', 'mediaWidth'],
        table_block: ['tableData'],
        database: ['databaseId', 'viewId'],
        layout: ['layoutMode', 'layoutConfig', 'layoutCells'],
        column_list: ['children with column blocks'],
      },
    },
    slashCommands: SLASH_BLOCK_COMMANDS,
    workspace,
    exampleContent: includeExamples ? RICH_BLOCK_EXAMPLE : undefined,
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
  description: `Create a new osionos page in a workspace. For complex notes, prefer explicit content arrays using the osionos Block schema. ${RICH_BLOCK_GUIDE}`,
  inputSchema: {
    workspaceId: z.string().min(1),
    title: z.string().min(1).default('Untitled'),
    text: z.string().optional().describe('Markdown/slash-like text converted into osionos blocks. Supports headings, lists, todos, quotes, dividers, fenced code, pipe tables, and slash directives such as /callout, /columns, /equation, /image, /layout.'),
    content: z.array(z.unknown()).optional().describe('Explicit osionos block array. Overrides text when provided. Use this for rich notes with nested children, tables, columns, media, layout, equations, or database blocks.'),
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
      content: Array.isArray(content) ? normalizeExplicitBlocks(content) : textToBlocks(text ?? ''),
    },
  });
  return textResult({ created: compactPage(page), page });
});

server.registerTool('osionos_update_page', {
  title: 'Update osionos Page',
  description: `Update page metadata and optionally replace page content. For complex replacements, prefer explicit content arrays. ${RICH_BLOCK_GUIDE}`,
  inputSchema: {
    pageId: z.string().min(1),
    title: z.string().optional(),
    icon: z.string().optional(),
    cover: z.string().optional(),
    text: z.string().optional().describe('Markdown/slash-like replacement content.'),
    content: z.array(z.unknown()).optional().describe('Explicit replacement osionos block array for rich notes.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ pageId, title, icon, cover, text, content }) => {
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (icon !== undefined) patch.icon = icon;
  if (cover !== undefined) patch.cover = cover;
  if (Array.isArray(content)) patch.content = normalizeExplicitBlocks(content);
  else if (text !== undefined) patch.content = textToBlocks(text);
  const page = await apiRequest(`/api/pages/${encodeURIComponent(pageId)}`, { method: 'PATCH', body: patch });
  return textResult({ updated: compactPage(page), page });
});

server.registerTool('osionos_append_to_page', {
  title: 'Append to osionos Page',
  description: 'Append markdown/slash-like text to an existing osionos page content array.',
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
  description: 'Inspect osionos capabilities, draft a page, and create it with rich osionos blocks.',
  argsSchema: {
    topic: z.string().min(1),
    workspaceId: z.string().min(1),
  },
}, ({ topic, workspaceId }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Call osionos_describe_app first. Then draft a useful osionos page about "${topic}". When ready, call osionos_create_page with workspaceId "${workspaceId}" and an explicit content array that demonstrates several supported slash/block elements, such as headings, paragraphs, lists, todos, toggles, callouts, quotes, code, equations, tables, columns, media placeholders, layout, and database references when relevant.`,
    },
  }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);