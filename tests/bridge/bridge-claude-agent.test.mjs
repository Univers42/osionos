/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-claude-agent.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { claudeChildEnv, configFromEnv, createUserSession, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { harnessConfig, withBridge } from './support/bridge-harness.mjs';

const callerId = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';

function sessionFor(config, isAdmin) {
	const payload = validateBridgePayload({ provider: 'prismatica', subject: callerId, email: 'a@example.com', name: 'A', jti: randomUUID() });
	const persisted = { workspaceId: randomUUID(), workspaceName: 'Home', workspaceSlug: 'home' };
	const { session } = createUserSession(payload, config, persisted, Date.now(), [], isAdmin);
	return { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' };
}

function stubSpawn(calls) {
	return (command, args, options) => {
		calls.push({ command, args, options });
		const child = new EventEmitter();
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		child.kill = () => {};
		setImmediate(() => child.emit('close', 0));
		return child;
	};
}

function configWith(flag) {
	const base = harnessConfig();
	return flag ? { ...base, agentClaudeEnabled: true } : base;
}

async function postStream(base, headers) {
	const response = await fetch(`${base}/api/agent/claude/stream`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'hi' }) });
	await response.text();
	return response.status;
}

describe('POST /api/agent/claude/stream', () => {
	it('is off by default, even for an admin session', async () => {
		const calls = [];
		const config = configWith(false);
		assert.equal(config.agentClaudeEnabled, false);
		await withBridge(config, fetch, async (base) => {
			assert.equal(await postStream(base, sessionFor(config, true)), 404);
		}, { spawnImpl: stubSpawn(calls) });
		assert.equal(calls.length, 0);
	});

	it('is only enabled by OSIONOS_AGENT_CLAUDE=1', () => {
		assert.equal(configFromEnv({ OSIONOS_AGENT_CLAUDE: '1' }).agentClaudeEnabled, true);
		assert.equal(configFromEnv({ OSIONOS_AGENT_CLAUDE: 'true' }).agentClaudeEnabled, false);
	});

	it('answers 401 with the flag on and no session', async () => {
		const calls = [];
		await withBridge(configWith(true), fetch, async (base) => {
			assert.equal(await postStream(base, { 'content-type': 'application/json' }), 401);
		}, { spawnImpl: stubSpawn(calls) });
		assert.equal(calls.length, 0);
	});

	it('answers 403 to a non-admin session and never spawns', async () => {
		const calls = [];
		const config = configWith(true);
		await withBridge(config, fetch, async (base) => {
			assert.equal(await postStream(base, sessionFor(config, false)), 403);
		}, { spawnImpl: stubSpawn(calls) });
		assert.equal(calls.length, 0);
	});

	it('spawns for an admin with an allowlisted child env only', async () => {
		const calls = [];
		const config = configWith(true);
		process.env.SERVICE_ROLE_KEY = 'must-not-leak';
		process.env.ANTHROPIC_API_KEY = 'kept';
		try {
			await withBridge(config, fetch, async (base) => {
				assert.equal(await postStream(base, sessionFor(config, true)), 200);
			}, { spawnImpl: stubSpawn(calls) });
		} finally {
			delete process.env.SERVICE_ROLE_KEY;
			delete process.env.ANTHROPIC_API_KEY;
		}
		assert.equal(calls.length, 1);
		const keys = Object.keys(calls[0].options.env);
		assert.ok(keys.includes('ANTHROPIC_API_KEY'));
		assert.ok(keys.every((key) => ['PATH', 'HOME', 'LANG'].includes(key) || key.startsWith('ANTHROPIC_')), keys.join(','));
	});
});

describe('claudeChildEnv', () => {
	it('drops everything but PATH, HOME, LANG and ANTHROPIC_*', () => {
		const env = claudeChildEnv({ PATH: '/bin', HOME: '/h', LANG: 'C', ANTHROPIC_MODEL: 'm', JWT_SECRET: 's', SERVICE_ROLE_KEY: 'k', LC_ALL: 'x' });
		assert.deepEqual(Object.keys(env).sort(), ['ANTHROPIC_MODEL', 'HOME', 'LANG', 'PATH']);
	});
});
