/* ************************************************************************** */
/*                                                                            */
/*   stack.ts                              the throwaway stack of a run      */
/*                                                                            */
/*   The seed of the golden set, the three members of the workspace, the    */
/*   real indexer until the queue is empty, and the map of the pages and of  */
/*   the workspaces the retrieval runs in.                                   */
/*                                                                            */
/*   Nothing here is specific to a variant of the retrieval: the corpus is  */
/*   the same, the index is the same, and the same chunks carry the same    */
/*   vectors in every run.                                                   */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                      */
/* ************************************************************************** */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { Embedder } from '../src/indexer/embedder.ts';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { liveMemberWorkspaces } from '../src/retrieval/acl.ts';
import { USER_IDS, WORKSPACE_ID, pageId, readCorpus } from './lib.mjs';
import type { GoldenQuestion, PageRow } from './score.ts';

const execFileAsync = promisify(execFile);

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

// The user ids of the golden set, by their key (u_ana, u_ben, u_chloe).
const USER_ID_BY_KEY = USER_IDS as Record<string, string>;

/** What a run needs to know about the stack it runs on. */
export interface StackOptions {
	databaseUrl: string;
	embedUrl: string;
	embedModel: string;
	/** How long the indexer may take to empty the queue. */
	indexTimeoutMs: number;
	/** The bite of the leak check: the acl questions run as the owner. */
	skipAclFilter: boolean;
}

/** What the indexer did, for the report. */
export interface IndexReport {
	ms: number;
	workMs: number;
	pages: number;
	chunks: number;
	embedded: number;
	withVector: number;
	/** The bytes the chunks and their vectors take in the database. */
	bytes: number;
}

/** The stack a run measures on. */
export interface EvalStack {
	/** The pool of the database of the run. */
	db: Pool;
	/** The pages of the corpus, as the database holds them. */
	pages: Map<string, PageRow>;
	/** The workspaces of every user of the golden set, read live. */
	workspaces: Map<string, string[]>;
	/** The title of a corpus page, by its slug. */
	titleBySlug: Map<string, string>;
	/** The slug of a corpus page, by its page id. */
	slugByPageId: Map<string, string>;
	/** The user of a question: a member of the one workspace of the golden set. */
	authUser: (key: string) => AuthUser;
	/** The user the retrieval runs as. */
	retrievalUser: (question: GoldenQuestion) => AuthUser;
}

/** The sleep of a millisecond. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The corpus: the titles of the pages, and the owner of the answer of a question. */
function readCorpusIndex(): {
	titleBySlug: Map<string, string>;
	slugByPageId: Map<string, string>;
	ownerByQuestion: Map<string, string>;
} {
	const corpus = readCorpus();
	const titleBySlug = new Map<string, string>();
	const slugByPageId = new Map<string, string>();
	for (const page of corpus) {
		const meta = page.meta as Record<string, unknown>;
		titleBySlug.set(page.slug, String(meta.title ?? ''));
		slugByPageId.set(pageId(page.slug).toLowerCase(), page.slug);
	}
	// The owner of the page that answers a question: the corpus carries the
	// answer markers, so the page of a question id is the one that marks it.
	const ownerByQuestion = new Map<string, string>();
	for (const page of corpus) {
		for (const marker of page.markers) {
			for (const id of marker.ids) {
				if (!ownerByQuestion.has(id)) {
					ownerByQuestion.set(id, String((page.meta as Record<string, unknown>).owner));
				}
			}
		}
	}
	return { titleBySlug, slugByPageId, ownerByQuestion };
}

/** The seed of the golden set: the SQL of eval/seed.mjs, applied. */
async function applySeed(db: Pool): Promise<void> {
	const { stdout } = await execFileAsync(process.execPath, [path.join(EVAL_DIR, 'seed.mjs')], {
		maxBuffer: 64 * 1024 * 1024,
	});
	await db.query(stdout);
	const pages = await db.query<{ n: number }>('select count(*)::int as n from public.osionos_pages');
	console.log(`[eval] the seed wrote ${pages.rows[0]?.n ?? 0} pages`);
}

/** The three users of the golden set are members of the one workspace. */
async function addMembers(db: Pool): Promise<void> {
	for (const key of Object.keys(USER_ID_BY_KEY)) {
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $2, 'member', array['read'])
			 on conflict (workspace_id, user_id) do nothing`,
			[WORKSPACE_ID, USER_ID_BY_KEY[key]],
		);
	}
	console.log(`[eval] ${Object.keys(USER_ID_BY_KEY).length} users are members of the workspace`);
}

/** The indexer, until the queue is empty. */
async function indexCorpus(db: Pool, options: StackOptions): Promise<Omit<IndexReport, 'withVector' | 'bytes'>> {
	const embedder = new Embedder({ baseUrl: options.embedUrl, model: options.embedModel });
	const done: { chunks: number; embedded: number; ms: number }[] = [];
	const worker = new IndexerWorker({
		pool: db,
		embedder,
		databaseUrl: options.databaseUrl,
		log: (entry) => {
			if (String(entry.event ?? '') === 'indexed') {
				done.push({
					chunks: Number(entry.chunks ?? 0),
					embedded: Number(entry.embedded ?? 0),
					ms: Number(entry.ms ?? 0),
				});
				return;
			}
			console.log(JSON.stringify(entry));
		},
	});
	await worker.start();
	const started = Date.now();
	try {
		for (;;) {
			const pending = await db.query<{ n: number }>('select count(*)::int as n from public.ai_index_queue');
			const left = pending.rows[0]?.n ?? 0;
			if (left === 0) break;
			if (Date.now() - started > options.indexTimeoutMs) {
				throw new Error(`the indexer did not empty the queue in ${options.indexTimeoutMs} ms (${left} pages left)`);
			}
			await sleep(500);
		}
	} finally {
		await worker.stop();
	}
	const chunks = done.reduce((total, page) => total + page.chunks, 0);
	const embedded = done.reduce((total, page) => total + page.embedded, 0);
	const workMs = done.reduce((total, page) => total + page.ms, 0);
	return { ms: Date.now() - started, workMs, pages: done.length, chunks, embedded };
}

/** The pages of the corpus, as the database holds them. */
async function readPages(db: Pool): Promise<Map<string, PageRow>> {
	const result = await db.query<QueryResultRow & PageRow>(
		`select id, workspace_id, owner_id, visibility, collaborators, title, archived_at
		   from public.osionos_pages`,
	);
	return new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row]));
}

/**
 * The stack of a run: the database, the corpus, the members and the index.
 * The index is built once, and every variant of the retrieval reads it.
 */
export async function startStack(options: StackOptions): Promise<{ stack: EvalStack; index: IndexReport }> {
	const db = new Pool({
		connectionString: options.databaseUrl,
		max: 4,
		statement_timeout: 30_000,
		application_name: 'osionos-ai-eval',
	});
	await applySeed(db);
	await addMembers(db);

	const indexed = await indexCorpus(db, options);
	// The chunks that carry a vector: the embedder really ran.
	const vectors = await db.query<{ n: number }>(
		'select count(*)::int as n from public.ai_chunks where embedding is not null',
	);
	const withVector = vectors.rows[0]?.n ?? 0;
	// The size of the index: the cost of a model with wider vectors is read
	// against this number. The table is partitioned, so the size is the sum
	// of the partitions.
	const size = await db.query<{ bytes: string }>(
		`select coalesce(sum(pg_total_relation_size(child.oid)), 0) as bytes
		 from pg_class child
		 join pg_inherits inherited on inherited.inhrelid = child.oid
		 where inherited.inhparent = 'public.ai_chunks'::regclass`,
	);
	const bytes = Number(size.rows[0]?.bytes ?? 0);
	console.log(
		`[eval] the index: ${indexed.pages} pages, ${indexed.chunks} chunks, ${withVector} of them with a vector, ` +
			`${(indexed.ms / 1000).toFixed(1)} s (${(indexed.workMs / 1000).toFixed(1)} s of page work), ` +
			`${(bytes / 1024 / 1024).toFixed(2)} MB`,
	);

	const { titleBySlug, slugByPageId, ownerByQuestion } = readCorpusIndex();
	const pages = await readPages(db);
	const authUser = (key: string): AuthUser => ({
		userId: USER_ID_BY_KEY[key] ?? '',
		workspaceId: WORKSPACE_ID,
		memberWorkspaces: [],
		isAdmin: false,
		issuedAtMs: Date.now(),
	});
	const workspaces = new Map<string, string[]>();
	for (const key of Object.keys(USER_ID_BY_KEY)) {
		workspaces.set(key, await liveMemberWorkspaces(db, authUser(key)));
	}

	const retrievalUser = (question: GoldenQuestion): AuthUser => {
		if (!options.skipAclFilter) return authUser(question.asker);
		if (question.kind !== 'acl' || question.expected.length > 0) return authUser(question.asker);
		// The bite: the owner of the page that answers the question retrieves it,
		// and the asker of the question scores it.
		const owner = ownerByQuestion.get(question.id);
		return owner ? authUser(owner) : authUser(question.asker);
	};

	return {
		stack: { db, pages, workspaces, titleBySlug, slugByPageId, authUser, retrievalUser },
		index: { ...indexed, withVector, bytes },
	};
}
