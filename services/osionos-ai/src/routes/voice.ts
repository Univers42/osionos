import { randomUUID } from 'node:crypto';
import { config } from '../config.ts';
import { httpError, readRaw, sendError, sendJson } from '../http.ts';
import type { IncomingMessage } from 'node:http';
import type { Redis } from 'ioredis';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';
import { canonicalWav, MAX_DICTATION_BYTES, parseDictationWav, WavRefusal } from '../voice/wav.ts';
import { secondsUntilUtcMidnight, utcDay, voiceLockKey, voiceSecondsKey } from '../voice/quota.ts';

/**
 * The dictation: the audio of the user's voice, and the text it becomes.
 *
 * The service never decodes anything: the browser decodes, resamples and sends
 * a WAV the server can verify byte by byte (`src/voice/wav.ts`). What the STT
 * server receives is always `canonicalWav` of the parsed PCM — never the bytes
 * of the client.
 *
 * The audio lives in memory for the length of the call and is discarded with
 * the answer: it is never written, and neither it nor its text is ever logged.
 */

/** The languages the caller may ask for. `auto` is the model's own choice. */
const LANGUAGES = new Set(['auto', 'en', 'fr', 'es', 'de', 'it', 'pt']);

/** The margin of the lock: the call is over before the lock expires, if it is over at all. */
const LOCK_MARGIN_MS = 5_000;

/** The script that releases the lock, and only the lock of this call. */
const RELEASE_LOCK = `
if redis.call('get', KEYS[1]) == ARGV[1] then
	return redis.call('del', KEYS[1])
end
return 0
`;

/** The media type of the dictation: the WAV of the browser, nothing else. */
function isWavType(request: IncomingMessage): boolean {
	const header = String(request.headers['content-type'] ?? '');
	return header.split(';')[0].trim().toLowerCase() === 'audio/wav';
}

/** The language of the query, or `auto`. */
function languageOf(url: URL): string {
	const asked = (url.searchParams.get('lang') ?? 'auto').trim().toLowerCase();
	return LANGUAGES.has(asked) ? asked : 'auto';
}

/** The lock of the one dictation at a time. `null` when another one holds it. */
async function takeLock(redis: Redis, userId: string, ttlMs: number): Promise<string | null> {
	const token = `${userId}:${Date.now()}:${randomUUID()}`;
	const taken = await redis.set(voiceLockKey(userId), token, 'PX', ttlMs, 'NX');
	return taken === 'OK' ? token : null;
}

/** Releases the lock — the one of this call, never the one of another. */
async function releaseLock(redis: Redis, userId: string, token: string): Promise<void> {
	await redis.eval(RELEASE_LOCK, 1, voiceLockKey(userId), token);
}

/** The seconds the user already dictated today, and the seconds left. */
async function secondsUsed(redis: Redis, userId: string, now: Date): Promise<number> {
	const used = await redis.get(voiceSecondsKey(userId, utcDay(now)));
	return Number(used ?? 0);
}

/** Books the seconds of a dictation, and the day ends at the UTC midnight. */
async function bookSeconds(redis: Redis, userId: string, seconds: number, now: Date): Promise<void> {
	const key = voiceSecondsKey(userId, utcDay(now));
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	await redis.multi().incrby(key, seconds).expireat(key, Math.floor(midnight / 1000)).exec();
}

/**
 * The transcription, from the STT server.
 *
 * The server is the deployment's own (the URL is a setting, never a caller's),
 * so it needs no endpoint guard. The deadline is the configuration's.
 */
async function transcribe(wav: Buffer, language: string): Promise<string> {
	const form = new FormData();
	form.set('file', new Blob([wav], { type: 'audio/wav' }), 'dictation.wav');
	form.set('model', config.sttModel);
	form.set('response_format', 'json');
	if (language !== 'auto') form.set('language', language);
	const url = `${config.sttUrl?.replace(/\/$/, '')}/v1/audio/transcriptions`;
	const response = await fetch(url, {
		method: 'POST',
		body: form,
		signal: AbortSignal.timeout(config.sttTimeoutMs),
	});
	if (!response.ok) throw httpError(502, 'voice_failed');
	const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
	if (!body || typeof body.text !== 'string') throw httpError(502, 'voice_failed');
	return body.text;
}

/**
 * `POST /api/ai/voice/transcribe?lang=` — the text of a dictation.
 *
 * The answer is `{ "text": "..." }`, and the text goes to the caller's editor:
 * the service never submits anything, and never approves anything.
 */
export async function handleVoiceTranscribe(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (!isWavType(ctx.request)) {
		sendError(ctx.response, 415, 'unsupported_media_type');
		return 415;
	}
	if (!config.sttUrl) {
		sendError(ctx.response, 503, 'voice_unavailable');
		return 503;
	}

	const bytes = await readRaw(ctx.request, MAX_DICTATION_BYTES);
	let pcm: Buffer;
	let durationSeconds: number;
	try {
		const parsed = parseDictationWav(bytes);
		pcm = parsed.pcm;
		durationSeconds = parsed.durationSeconds;
	} catch (error) {
		if (error instanceof WavRefusal) {
			sendError(ctx.response, 400, 'invalid_audio');
			return 400;
		}
		throw error;
	}

	const now = new Date();
	const lock = await takeLock(ctx.deps.redis, user.userId, config.sttTimeoutMs + LOCK_MARGIN_MS);
	if (!lock) {
		sendError(ctx.response, 429, 'voice_busy');
		return 429;
	}
	try {
		if (await secondsUsed(ctx.deps.redis, user.userId, now) >= config.sttSecondsPerDay) {
			const retryAfter = secondsUntilUtcMidnight(now);
			ctx.response.setHeader('Retry-After', String(retryAfter));
			sendError(ctx.response, 429, 'voice_quota_exceeded');
			return 429;
		}
		let text: string;
		try {
			text = await transcribe(canonicalWav(pcm), languageOf(ctx.url));
		} catch (error) {
			const failure = error as { status?: number; code?: string; name?: string };
			if (failure?.name === 'TimeoutError') {
				sendError(ctx.response, 504, 'voice_timeout');
				return 504;
			}
			if (typeof failure?.status === 'number') {
				sendError(ctx.response, failure.status, failure.code ?? 'voice_failed');
				return failure.status;
			}
			sendError(ctx.response, 502, 'voice_failed');
			return 502;
		}
		await bookSeconds(ctx.deps.redis, user.userId, Math.ceil(durationSeconds), now);
		sendJson(ctx.response, 200, { text });
		return 200;
	} finally {
		await releaseLock(ctx.deps.redis, user.userId, lock).catch(() => undefined);
	}
}
