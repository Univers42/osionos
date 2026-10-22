/* ************************************************************************** */
/*                                                                            */
/*   variants.ts                        the four ways of picking the chunks   */
/*                                                                            */
/*   The experiment of the multilingual brief, on the same corpus, the same  */
/*   index and the same embedder:                                            */
/*                                                                            */
/*     A: retrieve(), the retrieval of the service, unchanged;                */
/*     B: the vector list is run once per language, and the lexical list    */
/*        and every per-language list are fused with the same RRF;           */
/*     C: the query is rewritten in English and in French by a small local   */
/*        LLM, and the lexical and the vector list of every rewrite are      */
/*        fused with the same RRF;                                           */
/*     D: B and C together: every query (the question and its two rewrites) */
/*        gets a lexical list and a vector list per language.                */
/*                                                                            */
/*   The lists are built and fused by eval/fusion.ts, with the permission    */
/*   predicate of src/retrieval/acl.ts and the read rule of the bridge.      */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                       */
/* ************************************************************************** */

import { performance } from 'node:perf_hooks';
import type { Pool } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { Embedder } from '../src/indexer/embedder.ts';
import { ROW_ALLOWED_SQL, WORKSPACE_ALLOWED_SQL } from '../src/retrieval/acl.ts';
import { retrieve } from '../src/retrieval/search.ts';
import { fusionSql, readable } from './fusion.ts';
import type { CandidateRow, LanguageMap } from './fusion.ts';

/** The number of chunks an answer holds in the golden set. */
export const ANSWER_LIMIT = 5;

/** The variants of the experiment. */
export type VariantId = 'A' | 'B' | 'C' | 'D';

/** The name of a variant, for the report. */
export const VARIANT_NAMES: Record<VariantId, string> = {
	A: 'A — retrieve(), unchanged',
	B: 'B — the vector list per language, fused with the lexical one',
	C: 'C — the query rewritten by the LLM, in English and in French',
	D: 'D — B and C together',
};

/** One chunk of an answer. */
export interface VariantChunk {
	pageId: string;
	title: string;
	score: number;
}

/** What one variant answered. */
export interface VariantAnswer {
	/** The chunks of the answer, in the order of the fusion. */
	chunks: VariantChunk[];
	/** The milliseconds the retrieval took, the LLM excluded. */
	latencyMs: number;
	/** The milliseconds the LLM took; null when there was no LLM. */
	llmMs: number | null;
	/** The raw cosine similarity of the best vector hit; null when there was none. */
	topCosine: number | null;
}

/** What a variant needs to answer a question. */
export interface VariantContext {
	db: Pool;
	user: AuthUser;
	workspaces: readonly string[];
	embedder: Embedder;
	languages: LanguageMap;
}

/** The vector of a text, as the JSON the statement wants. */
async function vectorOf(embedder: Embedder, text: string): Promise<string> {
	const vectors = await embedder.embed([embedder.queryInput(text)]);
	const vector = vectors[0];
	if (!vector) throw new Error('tei_no_vector');
	return JSON.stringify(vector);
}

/** The raw cosine similarity of the best vector hit of a question. */
export async function topCosine(db: Pool, context: VariantContext, vector: string): Promise<number | null> {
	const client = await db.connect();
	try {
		await client.query('BEGIN');
		await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
		await client.query('SET LOCAL hnsw.ef_search = 200');
		const result = await client.query<{ cosine: number }>(
			`select 1 - (c.embedding <=> $3::halfvec) as cosine
			 from public.ai_chunks c
			 where c.source_kind = 'page' and ${WORKSPACE_ALLOWED_SQL} and ${ROW_ALLOWED_SQL}
			 order by c.embedding <=> $3::halfvec
			 limit 1`,
			[context.workspaces, context.user.userId, vector],
		);
		await client.query('COMMIT');
		const cosine = result.rows[0]?.cosine;
		return cosine === undefined ? null : Number(cosine);
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/** The lists of a variant, for one question and its rewrites. */
async function listsOf(
	variant: VariantId,
	question: string,
	rewrites: { english: string; french: string },
	context: VariantContext,
): Promise<{ kind: 'lexical' | 'vector'; text: string; vector: string; language: 'en' | 'fr' | null }[]> {
	const lists: { kind: 'lexical' | 'vector'; text: string; vector: string; language: 'en' | 'fr' | null }[] = [];
	const queries: string[] = [];
	if (variant === 'B' || variant === 'D') queries.push(question);
	if (variant === 'C' || variant === 'D') queries.push(rewrites.english, rewrites.french);
	for (const query of queries) {
		const vector = await vectorOf(context.embedder, query);
		lists.push({ kind: 'lexical', text: query, vector, language: null });
		if (variant === 'B' || variant === 'D') {
			lists.push({ kind: 'vector', text: query, vector, language: 'en' });
			lists.push({ kind: 'vector', text: query, vector, language: 'fr' });
		} else {
			lists.push({ kind: 'vector', text: query, vector, language: null });
		}
	}
	return lists;
}

/** The answer of a variant, for one question. */
export async function answerOf(
	variant: VariantId,
	question: string,
	context: VariantContext,
	rewrites: { english: string; french: string },
): Promise<VariantAnswer> {
	const started = performance.now();
	if (variant === 'A') {
		const chunks = await retrieve(context.db, context.user, { query: question, limit: ANSWER_LIMIT });
		const latencyMs = performance.now() - started;
		const cosine = await topCosine(context.db, context, await vectorOf(context.embedder, question));
		return {
			chunks: chunks.map((chunk) => ({ pageId: chunk.pageId, title: chunk.title, score: chunk.score })),
			latencyMs,
			llmMs: null,
			topCosine: cosine,
		};
	}
	const lists = await listsOf(variant, question, rewrites, context);
	const { sql, params } = fusionSql(lists, context.languages);
	const client = await context.db.connect();
	let candidates: CandidateRow[];
	try {
		await client.query('BEGIN');
		await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
		await client.query('SET LOCAL hnsw.ef_search = 200');
		const result = await client.query<CandidateRow>(sql, [context.workspaces, context.user.userId, ...params]);
		candidates = result.rows;
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
	const chunks = await readable(context.db, candidates, context.user, context.workspaces, ANSWER_LIMIT);
	return { chunks, latencyMs: performance.now() - started, llmMs: null, topCosine: null };
}
