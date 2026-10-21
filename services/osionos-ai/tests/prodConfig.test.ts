import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The service in production.
 *
 * The service reads its configuration when it is imported, so the case needs
 * a process of its own: the child runs with NODE_ENV=production and with both
 * development escape hatches set, and prints what the configuration kept.
 */

describe('osionos-ai in production', () => {
	it('the development escape hatches are ignored', async () => {
		const child = fileURLToPath(new URL('./prodConfigChild.ts', import.meta.url));
		const env = {
			...process.env,
			NODE_ENV: 'production',
			OSIONOS_AI_DEV_ENDPOINT_HOSTS: 'localhost,127.0.0.1',
			OSIONOS_AI_DEV_PROVIDER_BASE_URLS: '{"openrouter":"https://elsewhere.example/v1"}',
		};
		const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			const child_ = spawn(process.execPath, ['--experimental-strip-types', child], {
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let stdout = '';
			let stderr = '';
			child_.stdout.on('data', (chunk: Buffer) => {
				stdout += chunk.toString('utf8');
			});
			child_.stderr.on('data', (chunk: Buffer) => {
				stderr += chunk.toString('utf8');
			});
			child_.on('close', () => resolve({ stdout, stderr }));
			child_.on('error', reject);
		});
		const line = output.stdout.split('\n').find((entry) => entry.startsWith('RESULT '));
		assert.ok(line, `the child said nothing useful: ${output.stdout}${output.stderr}`);
		assert.match(line, /hosts=\[\]/);
		assert.match(line, /urls=\{\}/);

		// The warning names the variables, never what they carry.
		assert.match(output.stderr, /OSIONOS_AI_DEV_ENDPOINT_HOSTS/);
		assert.match(output.stderr, /OSIONOS_AI_DEV_PROVIDER_BASE_URLS/);
		assert.ok(!output.stderr.includes('elsewhere.example'), 'the value must not be printed');
		assert.ok(!output.stderr.includes('127.0.0.1'), 'the value must not be printed');
	});
});
