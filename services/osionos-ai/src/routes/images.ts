import { z } from 'zod';
import { config } from '../config.ts';
import { readJson, sendError, sendSseHeaders, writeSseFrame } from '../http.ts';
import { bearerToken } from '../auth.ts';
import { reserve, settle } from '../budget.ts';
import { checkRateLimit, IMAGE_LIMIT_PREFIX } from '../rateLimit.ts';
import { getRun, insertRun, markRun } from '../runs/repo.ts';
import * as runStore from '../runs/runStore.ts';
import { today } from '../runs/runner.ts';
import { ENGINE_TAG, generateOnEngine } from '../images/engine.ts';
import { joinQueue, leaveQueue, QUEUE_WAIT_MS, SECONDS_PER_IMAGE, waitTurn } from '../images/queue.ts';
import { takeDaySeat } from '../images/quota.ts';
import { checkImage, uploadImage } from '../images/store.ts';
import { replayRun, startPing } from './runs.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * `POST /api/ai/images` — one image of a prompt, as a run of kind `image`
 * (devil C70–C78).
 *
 * The answer is the stream of the run: `image.queued`, `image.started`,
 * `image.done` with the stored image and its provenance, then `done` — or
 * `error`. The run is the runs' own: the client's runId makes a re-POST a
 * replay, `GET /runs/:id/events` resumes it, `POST /runs/:id/cancel` stops it.
 *
 * The order is the one of the money: the windows and the counts of the day,
 * the queue, the price reserved — all before the engine is called. An image
 * refused or cancelled before the engine received the call costs nothing;
 * once received, it costs its price, whatever happens next (C74).
 *
 * The prompt is never stored and never in an event: the image's provenance
 * carries the model, the run and the date only (C77).
 */

/** The images of a user in a minute. */
const IMAGES_PER_MINUTE = 3;
const MAX_PROMPT_CHARS = 1000;
/** The refusals a re-POST of the same run answers again. */
const PREFLIGHT_ERRORS: Record<string, number> = {
	rate_limited: 429,
	image_quota_exceeded: 429,
	image_busy: 429,
	budget_exhausted: 402,
};
/** The failures an image run reports by name; anything else is the engine's. */
const KNOWN_FAILURES = new Set([
	'engine_unavailable',
	'image_busy',
	'invalid_image',
	'image_too_large',
	'animated_image',
	'storage_failed',
]);
const FAILURE_MESSAGES: Record<string, string> = {
	cancelled: 'the image was cancelled',
	timeout: 'the image engine did not answer in time',
	image_busy: 'the image engine is busy',
	storage_failed: 'the image could not be stored',
	engine_unavailable: 'the image engine is not running',
	engine_failed: 'the image engine failed',
};

// L0 of the prompt gate (C72): the engine reads its arguments from a tag in
// the prompt (steps, size…), so a prompt that carries the tag never reaches
// it. The schema is strict: there is no image input to a generation.
const imageSchema = z
	.object({
		runId: z.string().regex(UUID, 'runId must be a uuid'),
		prompt: z
			.string()
			.trim()
			.min(1)
			.max(MAX_PROMPT_CHARS)
			.refine((prompt) => !prompt.toLowerCase().includes(ENGINE_TAG), 'the prompt carries engine arguments'),
	})
	.strict();

/** The code of a failure: the run's own name for it, never an upstream body. */
function failureCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && KNOWN_FAILURES.has(code) ? code : 'engine_failed';
}

/** A run of the same id: replayed, refused again, or not the caller's. */
async function reattach(ctx: RouteContext, runId: string, ownerId: string): Promise<number> {
	const existing = await getRun(ctx.deps.db, runId);
	if (!existing || existing.owner_id !== ownerId || existing.kind !== 'image') {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const refused = existing.error ? PREFLIGHT_ERRORS[existing.error] : undefined;
	if (existing.status !== 'running' && refused) {
		sendError(ctx.response, refused, existing.error as string);
		return refused;
	}
	return replayRun(ctx, runId);
}

/** POST /api/ai/images */
export async function handleImages(ctx: RouteContext): Promise<number> {
	// Off, the route answers what an unknown route answers (C70).
	if (!config.imagesEnabled) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, imageSchema);
	const { db, redis } = ctx.deps;
	const { runId } = body;
	const ownerId = user.userId;
	const price = config.imageMicroUsd;

	const inserted = await insertRun(db, { runId, conversationId: null, ownerId, model: config.imageModel, kind: 'image' });
	if (inserted.kind === 'exists') return reattach(ctx, runId, ownerId);
	if (inserted.kind !== 'inserted') {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const refuse = async (status: number, code: string, retryAfterSeconds?: number): Promise<number> => {
		await markRun(db, runId, 'failed', code);
		if (retryAfterSeconds !== undefined) ctx.response.setHeader('retry-after', String(retryAfterSeconds));
		sendError(ctx.response, status, code);
		return status;
	};

	const now = new Date();
	const minute = await checkRateLimit(redis, ownerId, IMAGES_PER_MINUTE, now, IMAGE_LIMIT_PREFIX);
	if (!minute.allowed) return refuse(429, 'rate_limited', minute.retryAfterSeconds);
	const seat = await takeDaySeat(redis, ownerId, { perUser: config.imagesPerUserDay, global: config.imagesPerDay }, now);
	if (seat.kind === 'refused') return refuse(429, 'image_quota_exceeded', seat.retryAfterSeconds);
	const place = await joinQueue(redis, runId, now.getTime(), config.imageTimeoutMs);
	if (!place.joined) {
		await seat.giveBack();
		// Caveat: the wait is an estimate — the runs ahead times the warm
		// time of one image; a cold engine takes up to twice that.
		return refuse(429, 'image_busy', place.ahead * SECONDS_PER_IMAGE);
	}
	const day = today(now);
	const reserved = await reserve(db, {
		userId: ownerId,
		day,
		amount: price,
		userLimit: config.userDailyMicroUsd,
		platformLimit: config.platformDailyMicroUsd,
	});
	if (!reserved) {
		await seat.giveBack();
		await leaveQueue(redis, runId);
		return refuse(402, 'budget_exhausted');
	}
	await db.query('update public.ai_runs set reserved_microusd = $2::bigint where id = $1', [runId, price]);

	const token = bearerToken(ctx.request) ?? '';
	const controller = new AbortController();
	runStore.trackRun(runId, controller);
	const emit = async (type: string, data: unknown): Promise<void> => {
		const id = await runStore.append(redis, runId, type, data);
		writeSseFrame(ctx.response, { id, type, data });
	};
	sendSseHeaders(ctx.response);
	const stopPing = startPing(ctx.response);
	let deadline: AbortSignal | undefined;
	let engineCalled = false;
	try {
		if (place.position > 0) await emit('image.queued', { position: place.position });
		await waitTurn(redis, runId, {
			signal: controller.signal,
			deadlineMs: Date.now() + QUEUE_WAIT_MS,
			timeoutMs: config.imageTimeoutMs,
		});
		await emit('image.started', { runId, model: config.imageModel });
		deadline = AbortSignal.timeout(config.imageTimeoutMs);
		engineCalled = true;
		const raw = await generateOnEngine(body.prompt, AbortSignal.any([controller.signal, deadline]));
		// The engine is free as soon as it answered: the next run starts
		// while this one stores its image.
		await leaveQueue(redis, runId);
		const stored = await uploadImage(checkImage(raw), { runId, token, signal: controller.signal });
		const changed = await markRun(db, runId, 'succeeded', null, { images: 1, costMicroUsd: price });
		if (changed) await settle(db, { userId: ownerId, day, reserved: price, actual: price });
		await emit('image.done', {
			...stored,
			model: config.imageModel,
			runId,
			createdAt: new Date().toISOString(),
			generated: true,
		});
		await emit('done', { runId });
	} catch (error) {
		const code = controller.signal.aborted ? 'cancelled' : deadline?.aborted ? 'timeout' : failureCode(error);
		const charged = engineCalled && code !== 'engine_unavailable';
		// The row is closed before the terminal frame, as the text runs do.
		const changed = await markRun(db, runId, code === 'cancelled' ? 'cancelled' : 'failed', code);
		if (changed) await settle(db, { userId: ownerId, day, reserved: price, actual: charged ? price : 0 });
		if (!charged) await seat.giveBack();
		await emit('error', { code, message: FAILURE_MESSAGES[code] ?? 'the image was refused' });
	} finally {
		runStore.releaseRun(runId);
		await leaveQueue(redis, runId).catch(() => undefined);
		stopPing();
		if (!ctx.response.writableEnded && !ctx.response.destroyed) ctx.response.end();
	}
	return 200;
}
