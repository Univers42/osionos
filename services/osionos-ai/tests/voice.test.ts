import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';

import { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { startMockStt } from './mockStt.ts';
import { makeWav, pngBytes } from './voiceFixtures.ts';
import { canonicalWav, MAX_DICTATION_BYTES, parseDictationWav, WavRefusal } from '../src/voice/wav.ts';
import { utcDay, voiceSecondsKey } from '../src/voice/quota.ts';

/**
 * The dictation: the WAV the service accepts, the ones it refuses, and what
 * the speech-to-text server receives.
 *
 * The STT server is a mock on a random port of the loopback: the route
 * reaches it over the network, as it reaches the real one.
 */
const stt = await startMockStt();
process.env.OSIONOS_AI_STT_URL = stt.baseUrl;
process.env.OSIONOS_AI_STT_TIMEOUT_MS = '1000';
const { app, mock, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await stt.close();
});

/** The WAV of a dictation: 16 kHz, mono, PCM16. */
const GOOD_WAV = makeWav({ pcmBytes: 320 });

/** A dictation, as the route takes it. */
async function postWav(
	body: Buffer,
	options: { token?: string; type?: string; path?: string } = {},
): Promise<{ status: number; body: { text?: string; code?: string } | null; headers: Headers }> {
	const response = await fetch(`${base}${options.path ?? '/api/ai/voice/transcribe'}`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${options.token ?? tokenFor(USER_A, WORKSPACE_A)}`,
			'content-type': options.type ?? 'audio/wav',
		},
		body,
	});
	const text = await response.text();
	let parsed: { text?: string; code?: string } | null = null;
	try {
		parsed = text ? (JSON.parse(text) as { text?: string; code?: string }) : null;
	} catch {
		parsed = null;
	}
	return { status: response.status, body: parsed, headers: response.headers };
}

describe('osionos-ai dictation: the WAV it accepts', () => {
	it('a 16 kHz mono PCM16 file is the one dictation', () => {
		const parsed = parseDictationWav(GOOD_WAV);
		assert.equal(parsed.pcm.length, 320);
		assert.equal(parsed.durationSeconds, 0.01);
	});

	it('the refusals: a rate, a channel, a depth, a format, a lie', () => {
		const refused = (bytes: Buffer): string => {
			try {
				parseDictationWav(bytes);
			} catch (error) {
				assert.ok(error instanceof WavRefusal, 'the refusal is typed');
				return error.code;
			}
			return 'accepted';
		};
		assert.equal(refused(makeWav({ rate: 44_100 })), 'wrong_rate');
		assert.equal(refused(makeWav({ channels: 2 })), 'not_mono');
		assert.equal(refused(makeWav({ bits: 8 })), 'wrong_depth');
		assert.equal(refused(makeWav({ format: 3 })), 'not_pcm');
		assert.equal(refused(makeWav({ riffSize: 999 })), 'riff_size_mismatch');
		assert.equal(refused(GOOD_WAV.subarray(0, 30)), 'too_short');
		assert.equal(refused(pngBytes()), 'not_riff');
	});
});

describe('osionos-ai dictation: the route', () => {
	it('a dictation is transcribed, and the STT server gets the canonical WAV', async () => {
		stt.mode = 'ok';
		stt.text = 'the text of the mock';
		// The client sends a header that lies about the byte rate: the server
		// writes its own, and the PCM is the one of the client.
		const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
		const client = makeWav({ pcm, byteRate: 1234, blockAlign: 9 });
		const answer = await postWav(client);
		assert.equal(answer.status, 200);
		assert.equal(answer.body?.text, 'the text of the mock');
		const forwarded = stt.files[stt.files.length - 1];
		assert.deepEqual(forwarded, canonicalWav(pcm), 'the STT server gets the canonical header');
		assert.equal(stt.fields[stt.fields.length - 1]?.model, 'Systran/faster-whisper-small');
	});

	it('the language of the query is forwarded, and "auto" is not', async () => {
		await postWav(GOOD_WAV, { path: '/api/ai/voice/transcribe?lang=fr' });
		assert.equal(stt.fields[stt.fields.length - 1]?.language, 'fr');
		await postWav(GOOD_WAV, { path: '/api/ai/voice/transcribe?lang=auto' });
		assert.equal(stt.fields[stt.fields.length - 1]?.language, undefined);
	});

	it('a body that is not a WAV is refused, and never reaches the STT server', async () => {
		const before = stt.calls();
		const answer = await postWav(pngBytes());
		assert.equal(answer.status, 400);
		assert.equal(answer.body?.code, 'invalid_audio');
		assert.equal(stt.calls(), before, 'the STT server saw nothing');
	});

	it('a media type that is not audio/wav is refused with a 415', async () => {
		const answer = await postWav(GOOD_WAV, { type: 'audio/mpeg' });
		assert.equal(answer.status, 415);
		assert.equal(answer.body?.code, 'unsupported_media_type');
	});

	it('a caller without a token is refused with a 401', async () => {
		const answer = await postWav(GOOD_WAV, { token: 'not-a-token' });
		assert.equal(answer.status, 401);
	});

	it('a body of one byte over the cap is refused with a 413', async () => {
		const answer = await postWav(Buffer.alloc(MAX_DICTATION_BYTES + 1));
		assert.equal(answer.status, 413);
	});

	it('a second dictation at the same time is refused with a 429', async () => {
		stt.mode = 'hang';
		const first = postWav(GOOD_WAV);
		await stt.waitForCalls(stt.calls() + 1);
		const second = await postWav(GOOD_WAV);
		assert.equal(second.status, 429);
		assert.equal(second.body?.code, 'voice_busy');
		await first; // the first one ends on its own deadline
		stt.mode = 'ok';
	});

	it('an exhausted day is refused with a 429 and a Retry-After', async () => {
		const key = voiceSecondsKey(USER_B, utcDay(new Date()));
		await app.redis.set(key, '600');
		const answer = await postWav(GOOD_WAV, { token: tokenFor(USER_B, WORKSPACE_B) });
		assert.equal(answer.status, 429);
		assert.equal(answer.body?.code, 'voice_quota_exceeded');
		const retryAfter = Number(answer.headers.get('retry-after'));
		assert.ok(retryAfter > 0 && retryAfter <= 86_400, `the Retry-After is the rest of the day: ${retryAfter}`);
		await app.redis.del(key);
	});

	it('a speech-to-text server that never answers is a 504', async () => {
		stt.mode = 'hang';
		const answer = await postWav(GOOD_WAV);
		assert.equal(answer.status, 504);
		assert.equal(answer.body?.code, 'voice_timeout');
		stt.mode = 'ok';
	});

	it('the seconds of a dictation are booked for the day', async () => {
		const key = voiceSecondsKey(USER_A, utcDay(new Date()));
		await app.redis.del(key);
		await postWav(GOOD_WAV);
		assert.equal(Number(await app.redis.get(key)), 1, '0.01 s of audio is one second booked');
		await app.redis.del(key);
	});

	it('without a speech-to-text server the dictation is a 503', async () => {
		const child = fileURLToPath(new URL('./voiceChild.ts', import.meta.url));
		const env = { ...process.env };
		delete env.OSIONOS_AI_STT_URL;
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
		assert.match(line, /status=503/);
		assert.match(line, /code=voice_unavailable/);
	});
});

describe('osionos-ai dictation: nothing is written and nothing is logged', () => {
	it('the transcript and the audio never reach a log line', async () => {
		stt.mode = 'ok';
		stt.text = 'the secret transcript of the user';
		const pcm = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
		const client = makeWav({ pcm });
		const lines: string[] = [];
		const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
		for (const method of ['log', 'info', 'warn', 'error'] as const) {
			console[method] = (...args: unknown[]) => {
				lines.push(args.map((arg) => String(arg)).join(' '));
			};
		}
		try {
			const answer = await postWav(client);
			assert.equal(answer.status, 200);
			// The log line of the request is written after the answer leaves:
			// the capture has to outlive the answer.
			await new Promise((resolve) => setTimeout(resolve, 100));
		} finally {
			console.log = original.log;
			console.info = original.info;
			console.warn = original.warn;
			console.error = original.error;
		}
		const captured = lines.join('\n');
		assert.ok(captured.length > 0, 'the service logs the request');
		assert.ok(!captured.includes('the secret transcript of the user'), 'the transcript is not logged');
		assert.ok(!captured.includes('deadbeef'), 'the audio is not logged');
		assert.ok(!captured.includes('dead'), 'the audio is not logged');
	});
});

describe('osionos-ai: the chat is not indexed', () => {
	it('no indexer or retrieval reads a message or an attachment source', async () => {
		const root = fileURLToPath(new URL('../src/', import.meta.url));
		const files: string[] = [];
		for (const directory of ['indexer', 'retrieval']) {
			const names = await readdir(`${root}${directory}`);
			for (const name of names) if (name.endsWith('.ts')) files.push(`${root}${directory}/${name}`);
		}
		assert.ok(files.length > 0, 'the folders of the indexer and of the retrieval are not empty');
		for (const file of files) {
			const source = await readFile(file, 'utf8');
			for (const match of source.matchAll(/source_kind\s*(?:=|!=|<>|in|IN)\s*'([^']*)'/g)) {
				assert.equal(match[1], 'page', `${file} indexes a ${match[1]}`);
			}
			assert.ok(!/'message'|'attachment'/.test(source), `${file} names a message or an attachment`);
		}
	});
});
