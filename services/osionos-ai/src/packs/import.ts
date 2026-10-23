import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { createPool } from '../db.ts';
import { PASSAGE_PREFIX } from '../indexer/embedder.ts';
import { Embedder } from '../indexer/embedder.ts';
import { bulkEmbedUrl } from '../indexer/embedUrl.ts';
import { parsePackManifest } from './manifest.ts';
import type { PackManifest } from './manifest.ts';
import { markdownSections, markdownTitle } from './markdown.ts';

/**
 * The import of the knowledge packs: an operator CLI, never a route.
 *
 *   node --experimental-strip-types src/packs/import.ts <packsDir> <repoRoot>
 *
 * `<packsDir>` holds one directory per pack, each with a `pack.json`; the
 * manifest's `docs` are relative to `<repoRoot>` (the osionos repository), so
 * the pack COPIES nothing and the docs have one source of truth.
 *
 * The system workspace is OPERATOR configuration (C45): it must be set, be a
 * uuid, and hold no osionos_pages row. A workspace with a page is a workspace
 * a person writes in, and a pack imported there would mix the two scopes. The
 * refusal is one line and exit 2, before the database is read for anything
 * else.
 *
 * The import is idempotent at the document: the sha256 of the file is the
 * version, and a document whose hash did not move is not embedded again. A
 * changed document is replaced in ONE transaction (delete its chunks, embed
 * its sections, insert them, update its row), so a crash leaves the previous
 * chunks in place. A document that left the manifest is deleted, and the
 * trigger of the migration takes its chunks with it.
 *
 * A pack directory that disappeared from `<packsDir>` is LEFT AS IT IS:
 * retiring a pack is an operator `UPDATE` of `ai_packs.status` (YAGNI: no CLI
 * for it), so a half-finished migration of the directory cannot silently
 * retire the product docs.
 */

/** The shape of a uuid: anything else is not the system workspace. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The variables and the bounds of the import. */
const EMBED_MODEL_DEFAULT = 'intfloat/multilingual-e5-small';

/** The refusal: one line, exit 2. */
function refuse(message: string): never {
	console.error(`[osionos-ai-packs] refusing: ${message}`);
	process.exit(2);
}

/** The system workspace of the environment, or a refusal. */
function systemWorkspaceId(): string {
	const raw = (process.env.OSIONOS_AI_SYSTEM_WORKSPACE_ID ?? '').trim();
	if (!UUID.test(raw)) {
		refuse('OSIONOS_AI_SYSTEM_WORKSPACE_ID is unset or is not a uuid');
	}
	return raw.toLowerCase();
}

/** The manifest files of a packs directory, in slug order. */
function packFiles(packsDir: string): string[] {
	if (!existsSync(packsDir)) refuse(`the packs directory does not exist: ${packsDir}`);
	const files: string[] = [];
	for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = join(packsDir, entry.name, 'pack.json');
		if (existsSync(file)) files.push(file);
	}
	return files.sort();
}

/** The sha256 of a file, in hex: the version of a document. */
function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** What one pack did. */
interface PackResult {
	slug: string;
	docs: number;
	embedded: number;
	unchanged: number;
	removed: number;
}

/** The row of a document that is already imported. */
interface DocumentRow {
	id: string;
	content_sha256: string;
}

/** The upsert of the pack, by slug. */
async function upsertPack(pool: Pool, manifest: PackManifest): Promise<string> {
	const result = await pool.query<{ id: string }>(
		`insert into public.ai_packs (slug, title, description)
		 values ($1, $2, $3)
		 on conflict (slug) do update
		   set title = excluded.title,
		       description = excluded.description,
		       updated_at = now()
		 returning id`,
		[manifest.slug, manifest.title, manifest.description],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error('pack_upsert_returned_no_row');
	return String(id);
}

/** The vectors of a batch of inputs, in the order of the inputs. */
async function embedBatch(embedder: Embedder, inputs: readonly string[]): Promise<number[][]> {
	const vectors: number[][] = [];
	for (let index = 0; index < inputs.length; index += embedder.maxInputsPerRequest) {
		const part = inputs.slice(index, index + embedder.maxInputsPerRequest);
		const answer = await embedder.embedCall(part);
		vectors.push(...answer.vectors);
	}
	return vectors;
}

/**
 * One document, imported.
 *
 * The chunks of the document are deleted, its sections embedded, and the new
 * chunks written, all in one transaction. A failure rolls the transaction back
 * and leaves the previous version of the document in the index.
 */
async function importDocument(
	pool: Pool,
	embedder: Embedder,
	{
		packId,
		manifest,
		systemWorkspace,
		path,
		bytes,
		hash,
	}: {
		packId: string;
		manifest: PackManifest;
		systemWorkspace: string;
		path: string;
		bytes: Buffer;
		hash: string;
	},
): Promise<number> {
	const text = bytes.toString('utf8');
	const title = markdownTitle(path, text);
	const chunks = markdownSections(path, text);
	const inputs = chunks.map((chunk) => `${PASSAGE_PREFIX}${chunk.headingPath}\n${chunk.content}`);
	const vectors = await embedBatch(embedder, inputs);
	if (vectors.length !== chunks.length) throw new Error('embed_batch_count');

	const client: PoolClient = await pool.connect();
	try {
		await client.query('BEGIN');
		const doc = await client.query<{ id: string }>(
			`insert into public.ai_pack_docs (pack_id, path, title, content_sha256)
			 values ($1, $2, $3, $4)
			 on conflict (pack_id, path) do update
			   set title = excluded.title,
			       content_sha256 = excluded.content_sha256,
			       updated_at = now()
			 returning id`,
			[packId, path, title, hash],
		);
		const docId = doc.rows[0]?.id;
		if (!docId) throw new Error('pack_doc_upsert_returned_no_row');
		await client.query(`delete from public.ai_chunks where source_kind = 'pack' and source_id = $1`, [docId]);
		for (const [index, chunk] of chunks.entries()) {
			await client.query(
				`insert into public.ai_chunks (
					workspace_id, source_kind, source_id, block_id, ord, title, heading_path,
					content, content_hash, owner_id, visibility, collaborator_ids, embedding, embedding_model
				 ) values (
					$1, 'pack', $2, null, $3, $4, $5, $6, decode($7, 'hex'),
					null, null, '{}'::uuid[], $8::halfvec, $9
				 )`,
				[
					systemWorkspace,
					docId,
					chunk.ord,
					manifest.title,
					chunk.headingPath,
					chunk.content,
					chunk.contentHash,
					JSON.stringify(vectors[index]),
					embedder.model,
				],
			);
		}
		await client.query('COMMIT');
		return chunks.length;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/** One pack: its documents, its embeddings, and the rows that left it. */
async function importPack(
	pool: Pool,
	embedder: Embedder,
	{ manifest, repoRoot, systemWorkspace }: { manifest: PackManifest; repoRoot: string; systemWorkspace: string },
): Promise<PackResult> {
	const packId = await upsertPack(pool, manifest);
	const existing = await pool.query<DocumentRow & { path: string }>(
		`select id, path, content_sha256 from public.ai_pack_docs where pack_id = $1`,
		[packId],
	);
	const byPath = new Map(existing.rows.map((row) => [String(row.path), row]));

	const result: PackResult = {
		slug: manifest.slug,
		docs: manifest.docs.length,
		embedded: 0,
		unchanged: 0,
		removed: 0,
	};

	for (const path of manifest.docs) {
		const bytes = readFileSync(resolve(repoRoot, path));
		const hash = sha256(bytes);
		const current = byPath.get(path) ?? null;
		if (current && current.content_sha256 === hash) {
			result.unchanged += 1;
			continue;
		}
		const embedded = await importDocument(pool, embedder, {
			packId,
			manifest,
			systemWorkspace,
			path,
			bytes,
			hash,
		});
		result.embedded += embedded;
	}

	const wanted = new Set(manifest.docs);
	for (const row of existing.rows) {
		if (wanted.has(String(row.path))) continue;
		// The trigger of the migration takes the chunks of the document.
		await pool.query(`delete from public.ai_pack_docs where id = $1`, [row.id]);
		result.removed += 1;
	}

	return result;
}

/** The CLI. */
async function main(): Promise<void> {
	const [packsDir, repoRoot] = process.argv.slice(2);
	if (!packsDir || !repoRoot) {
		refuse('usage: node --experimental-strip-types src/packs/import.ts <packsDir> <repoRoot>');
	}
	const systemWorkspace = systemWorkspaceId();
	const databaseUrl = (process.env.OSIONOS_AI_DATABASE_URL ?? '').trim();
	if (databaseUrl.length === 0) refuse('OSIONOS_AI_DATABASE_URL is unset');
	const embedUrl = bulkEmbedUrl();
	if (embedUrl.length === 0) refuse('OSIONOS_AI_EMBED_URL (or OSIONOS_AI_EMBED_BULK_URL) is unset');
	const model = (process.env.OSIONOS_AI_EMBED_MODEL ?? '').trim() || EMBED_MODEL_DEFAULT;

	const pool = createPool(databaseUrl);
	try {
		// C45: the system workspace is dedicated and knowledge-only. A page is
		// a workspace a person writes in, and the import refuses it.
		const pages = await pool.query<{ count: string }>(
			`select count(*)::text as count from public.osionos_pages where workspace_id = $1`,
			[systemWorkspace],
		);
		const count = Number(pages.rows[0]?.count ?? '0');
		if (count > 0) {
			refuse(`the system workspace ${systemWorkspace} holds ${count} osionos_pages row(s): it is not knowledge-only`);
		}

		const embedder = new Embedder({ baseUrl: embedUrl, model });
		for (const file of packFiles(packsDir)) {
			const manifest = parsePackManifest(JSON.parse(readFileSync(file, 'utf8')) as unknown, repoRoot);
			const result = await importPack(pool, embedder, { manifest, repoRoot, systemWorkspace });
			console.log(JSON.stringify(result));
		}
	} finally {
		await pool.end();
	}
}

try {
	await main();
} catch (error) {
	console.error(`[osionos-ai-packs] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
