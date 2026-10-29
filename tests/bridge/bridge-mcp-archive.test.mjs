/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mcp-archive.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('osionos MCP archive_page archives instead of deleting', () => {
	const requests = [];
	let fakeBridge;
	let bridgePort;
	let mcpClient;
	let mcpTransport;

	before(async () => {
		fakeBridge = http.createServer((req, res) => {
			let body = '';
			req.on('data', (chunk) => { body += chunk; });
			req.on('end', () => {
				let parsed = null;
				if (body) {
					try { parsed = JSON.parse(body); } catch { parsed = body; }
				}
				requests.push({ method: req.method, url: req.url, body: parsed });
				res.setHeader('content-type', 'application/json');
				if (req.url === '/api/auth/bridge/health') {
					res.end(JSON.stringify({ service: 'osionos-bridge' }));
					return;
				}
				res.end(JSON.stringify({ id: 'page-1', archivedAt: parsed?.archivedAt ?? null }));
			});
		});
		await new Promise((resolve) => fakeBridge.listen(0, '127.0.0.1', resolve));
		bridgePort = fakeBridge.address().port;
		const url = `http://127.0.0.1:${bridgePort}`;

		mcpTransport = new StdioClientTransport({
			command: 'node',
			args: ['scripts/osionos-mcp-server.mjs'],
			env: {
				...process.env,
				OSIONOS_MCP_BRIDGE_URL: url,
				OSIONOS_MCP_API_URL: url,
				OSIONOS_MCP_JWT: 'test-jwt',
			},
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

	it('sends exactly one PATCH with an ISO archivedAt and zero DELETEs', async () => {
		requests.length = 0;
		const result = await mcpClient.callTool({ name: 'osionos_archive_page', arguments: { pageId: 'page-1' } });
		assert.ok(result, 'tool returned a result');
		const pageReqs = requests.filter((r) => r.url.startsWith('/api/pages/'));
		const patches = pageReqs.filter((r) => r.method === 'PATCH');
		const deletes = pageReqs.filter((r) => r.method === 'DELETE');
		assert.equal(patches.length, 1, `expected 1 PATCH, got ${patches.length}`);
		assert.equal(deletes.length, 0, `expected 0 DELETEs, got ${deletes.length}`);
		assert.equal(patches[0].url, '/api/pages/page-1');
		assert.match(String(patches[0].body?.archivedAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});
});
