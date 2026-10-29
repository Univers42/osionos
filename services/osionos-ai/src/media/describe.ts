import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { config } from '../config.ts';
import { httpError } from '../http.ts';
import { fetchAttachment } from '../vision/fetchAttachment.ts';
import { readImageHeader } from '../vision/imageHeader.ts';
import { stripMetadata } from '../vision/stripMetadata.ts';
import { Seat } from './semaphore.ts';
import { askVlm, RETRY_AFTER_SECONDS } from './vlmClient.ts';
import type { StoredAnnotation } from './vlmClient.ts';

/**
 * "Describe image" (M7): what the local VLM says about ONE picture the caller
 * asked about. On request only (devil C94: no scan of private content); the
 * bytes come through the bridge with the caller's token (C80/C81), are checked
 * and stripped before anything else, and the answer is cached by the hash of
 * the STRIPPED bytes, the model and its revision.
 *
 * The `safety` hint is stored for moderation (C92/C97) and never returned.
 */

/** What the client gets. */
export interface Description {
	caption: string;
	tags: string[];
	objects: string[];
	ocr: string;
}

/** The context of one call: the database and the caller's own token. */
export interface DescribeContext {
	db: Pool;
	token: string;
}

/** The one seat of the CPU server. */
const seat = new Seat();

function visible(annotation: StoredAnnotation): Description {
	const { caption, tags, objects, ocr } = annotation;
	return { caption, tags, objects, ocr };
}

async function cached(db: Pool, sha256: string): Promise<StoredAnnotation | null> {
	const found = await db.query<{ result: StoredAnnotation }>(
		'select result from public.ai_media_annotations where sha256 = $1 and model = $2 and revision = $3',
		[sha256, config.vlmModel, config.vlmRevision],
	);
	return found.rows[0]?.result ?? null;
}

/** Describes the picture at a media capability path. Throws errors that carry `status` and `code`. */
export async function describeImage(ctx: DescribeContext, input: { path: string }): Promise<Description> {
	const fetched = await fetchAttachment(input.path, ctx.token);
	// The format is the one the bytes say, whatever the bridge announced; the
	// header read also refuses what is not png/jpeg/webp and what is over the
	// pixel cap, before the VLM sees anything.
	const header = readImageHeader(fetched.bytes);
	const stripped = stripMetadata(fetched.bytes);
	const sha256 = createHash('sha256').update(stripped).digest('hex');

	const hit = await cached(ctx.db, sha256);
	if (hit) return visible(hit);

	const release = await seat.take(config.vlmQueueWaitMs);
	if (!release) throw Object.assign(httpError(429, 'vlm_busy'), { retryAfterSeconds: RETRY_AFTER_SECONDS });
	try {
		// The request ahead of us may have described the same picture.
		const meanwhile = await cached(ctx.db, sha256);
		if (meanwhile) return visible(meanwhile);
		const annotation = await askVlm(stripped, header.format);
		await ctx.db.query(
			`insert into public.ai_media_annotations (sha256, model, revision, result)
			 values ($1, $2, $3, $4::jsonb) on conflict do nothing`,
			[sha256, config.vlmModel, config.vlmRevision, JSON.stringify(annotation)],
		);
		return visible(annotation);
	} finally {
		release();
	}
}
