import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { makeRunCredential } = await import('../src/modes/credential.ts');

/**
 * AM1: the session token reaches no row, key, log line or event. Reads src/ from
 * the filesystem (no git needed, so it cannot skip) and fails when it scans
 * nothing.
 *
 * Caveat: a line scan. A token passed through a variable renamed away from
 * `sessionToken` or `credential` is not seen (under-reports); a line that merely
 * mentions the word beside a sink is flagged (over-reports) and needs an
 * allowlist entry with its reason. The behavioural half is credential.test.ts.
 */
describe('AM1: the token is never persisted, logged or emitted', () => {
	const SUBJECT = /sessionToken|credential/i;
	const SINK = /insert into|update\s+public|redis\.\w*(set|xadd|publish|push)|\blog\w*\.|console\.|\bemit\(|JSON\.stringify|new Error\(|\bthrow\b/i;
	const ALLOWED: Array<[RegExp, string]> = [
		[/src\/approvals\/autoDecide\.ts:.*throw new Error\('no credential'\)/, 'a fixed message with no token, caught in the same function'],
	];

	function files(dir: string): string[] {
		return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
	}

	it('no src line pairs the token or credential with a store, a log or an event', () => {
		const all = files('src');
		assert.ok(all.length > 100, `scanned ${all.length} files: a scan of nothing proves nothing`);
		const hits: string[] = [];
		for (const file of all) {
			readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
				const code = line.trim();
				if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
				if (!SUBJECT.test(code) || !SINK.test(code)) return;
				const where = `${file}:${i + 1}: ${code}`;
				if (!ALLOWED.some(([pattern]) => pattern.test(where))) hits.push(where);
			});
		}
		assert.deepEqual(hits, []);
	});

	it('printing or serializing a credential never shows the token', () => {
		const credential = makeRunCredential('SECRET-TOKEN-VALUE', Date.now() + 3_600_000);
		assert.ok(!JSON.stringify({ credential }).includes('SECRET-TOKEN-VALUE'));
		assert.ok(!String(credential).includes('SECRET-TOKEN-VALUE'));
	});
});
