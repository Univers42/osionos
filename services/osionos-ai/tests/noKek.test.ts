import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The service without a KEK.
 *
 * The service reads its configuration when it is imported, so the case needs
 * a process of its own: the child starts the service without a KEK, asks for
 * a connection and for the list, and prints what it got.
 */

describe('osionos-ai without a KEK', () => {
	it('the creation of a connection is refused, and the platform connection is served', async () => {
		const child = fileURLToPath(new URL('./noKekChild.ts', import.meta.url));
		const env = { ...process.env };
		delete env.OSIONOS_AI_KEK;
		const output = await new Promise<string>((resolve, reject) => {
			const child_ = spawn(process.execPath, ['--experimental-strip-types', child], {
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let text = '';
			const collect = (chunk: Buffer) => {
				text += chunk.toString('utf8');
			};
			child_.stdout.on('data', collect);
			child_.stderr.on('data', collect);
			child_.on('close', () => resolve(text));
			child_.on('error', reject);
		});
		const line = output.split('\n').find((entry) => entry.startsWith('RESULT '));
		assert.ok(line, `the child said nothing useful: ${output}`);
		assert.match(line, /post=503/);
		assert.match(line, /code=connections_unavailable/);
		assert.match(line, /list=200/);
		assert.match(line, /connections=platform/);
	});
});
