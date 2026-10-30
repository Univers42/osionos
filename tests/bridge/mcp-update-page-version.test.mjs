/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-update-page-version.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * #82: strict mode (OSIONOS_PAGE_STRICT_VERSION) refuses a content PATCH that carries
 * no baseVersion and changes the content. osionos_update_page replaces content, so it
 * must send the version the replacement was made against — the agent's, or the one it
 * reads right before the write. A metadata-only update needs no version.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const STORED_VERSION = 7;

describe('osionos MCP update_page sends the content version it writes against', () => {
	const requests = [];
	let fakeBridge;
	let mcpClient;
	let mcpTransport;

	before(async () => {
		fakeBridge = http.createServer((req, res) => {
			let body = '';
			req.on('data', (chunk) => { body += chunk; });
			req.on('end', () => {
				requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
				res.setHeader('content-type', 'application/json');
				if (req.url === '/api/auth/bridge/health') return res.end(JSON.stringify({ service: 'osionos-bridge' }));
				if (req.method === 'GET') return res.end(JSON.stringify({ _id: 'page-1', title: 'P', content: [], contentVersion: STORED_VERSION }));
				return res.end(JSON.stringify({ ok: true, version: STORED_VERSION + 1 }));
			});
		});
		await new Promise((resolve) => fakeBridge.listen(0, '127.0.0.1', resolve));
		const url = `http://127.0.0.1:${fakeBridge.address().port}`;
		mcpTransport = new StdioClientTransport({
			command: 'node',
			args: ['scripts/osionos-mcp-server.mjs'],
			env: { ...process.env, OSIONOS_MCP_BRIDGE_URL: url, OSIONOS_MCP_API_URL: url, OSIONOS_MCP_JWT: 'test-jwt' },
			cwd: process.cwd(),
		});
		mcpClient = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
		await mcpClient.connect(mcpTransport);
	});

	after(async () => {
		try { await mcpClient?.close(); } catch (error) { void error; }
		try { mcpTransport?.close?.(); } catch (error) { void error; }
		await new Promise((resolve) => fakeBridge.close(resolve));
	});

	const pageCalls = () => requests.filter((r) => r.url.startsWith('/api/pages/'));
	const update = (args) => mcpClient.callTool({ name: 'osionos_update_page', arguments: { pageId: 'page-1', ...args } });

	it('sends the agent\'s baseVersion with a content replacement, without a read', async () => {
		requests.length = 0;
		await update({ text: 'new body', baseVersion: 3 });
		const calls = pageCalls();
		assert.deepEqual(calls.map((r) => r.method), ['PATCH']);
		assert.equal(calls[0].body.baseVersion, 3);
		assert.ok(Array.isArray(calls[0].body.content));
	});

	it('reads the stored version first when the agent gave none', async () => {
		requests.length = 0;
		await update({ text: 'new body' });
		const calls = pageCalls();
		assert.deepEqual(calls.map((r) => r.method), ['GET', 'PATCH']);
		assert.equal(calls[1].body.baseVersion, STORED_VERSION);
	});

	it('sends no version and no read for a metadata-only update', async () => {
		requests.length = 0;
		await update({ title: 'Renamed' });
		const calls = pageCalls();
		assert.deepEqual(calls.map((r) => r.method), ['PATCH']);
		assert.equal(Object.hasOwn(calls[0].body, 'baseVersion'), false);
	});
});
