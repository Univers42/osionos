import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The service in production.
 *
 * The service reads its configuration when it is imported, so each case needs
 * a process of its own: the child runs with NODE_ENV=production and prints
 * what the configuration kept.
 */
const CHILD = fileURLToPath(new URL('./prodConfigChild.ts', import.meta.url));

function runChild(env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--experimental-strip-types', CHILD], {
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8');
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
		});
		child.on('close', () => resolve({ stdout, stderr }));
		child.on('error', reject);
	});
}

function resultLine(output: { stdout: string; stderr: string }): string {
	const line = output.stdout.split('\n').find((entry) => entry.startsWith('RESULT '));
	assert.ok(line, `the child said nothing useful: ${output.stdout}${output.stderr}`);
	return line;
}

// A deployment in production has the bridge: the write tools need it, and the
// URL is operator configuration.
const PRODUCTION = { NODE_ENV: 'production', OSIONOS_AI_BRIDGE_URL: 'http://bridge.invalid:4000' };

describe('osionos-ai in production', () => {
	it('the development escape hatches are ignored', async () => {
		const output = await runChild({
			...process.env,
			...PRODUCTION,
			OSIONOS_AI_DEV_ENDPOINT_HOSTS: 'localhost,127.0.0.1',
			OSIONOS_AI_DEV_PROVIDER_BASE_URLS: '{"openrouter":"https://elsewhere.example/v1"}',
		});
		const line = resultLine(output);
		assert.match(line, /hosts=\[\]/);
		assert.match(line, /urls=\{\}/);
		// The warning names the variables, never what they carry.
		assert.match(output.stderr, /OSIONOS_AI_DEV_ENDPOINT_HOSTS/);
		assert.match(output.stderr, /OSIONOS_AI_DEV_PROVIDER_BASE_URLS/);
		assert.ok(!output.stderr.includes('elsewhere.example'), 'the value must not be printed');
		assert.ok(!output.stderr.includes('127.0.0.1'), 'the value must not be printed');
	});

	it('a production without the bridge refuses to start (C12)', async () => {
		const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
		// The bridge is the operator configuration of the write tools: a
		// deployment without it has no write path at all.
		delete env.OSIONOS_AI_BRIDGE_URL;
		const output = await runChild(env);
		assert.ok(!output.stdout.includes('RESULT '), 'the service did not start');
		assert.match(output.stderr, /OSIONOS_AI_BRIDGE_URL/);
	});

	// The compose passes it as ${…:-}: an unset operator value arrives as "",
	// which coerced to 0 and refused the boot (live outage 2026-11-21).
	it('an empty research daily budget keeps the default and boots', async () => {
		const output = await runChild({
			...process.env,
			...PRODUCTION,
			OSIONOS_AI_RESEARCH_PLATFORM_DAILY: '',
		});
		assert.match(resultLine(output), /research=20/);
	});
});
