/* ************************************************************************** */
/*                                                                            */
/*   fusion.ts                        the lists of a search, and their fusion */
/*                                                                            */
/*   The service fuses two lists (the lexical one and the vector one) with   */
/*   the reciprocal rank fusion, k=60. This module holds the machinery the   */
/*   variants of the experiment need: several lists at once, and a vector    */
/*   list that may be restricted to one language.                             */
/*                                                                            */
/*   The predicate of the permissions is the one of src/retrieval/acl.ts,    */
/*   imported and not rewritten: the pre-filter of a variant is the twin of  */
/*   the one of the service. The pages that come out of the fusion are       */
/*   checked again with the bridge's own rule, exactly as the service does.  */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                       */
/* ************************************************************************** */

import type { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { ROW_ALLOWED_SQL, WORKSPACE_ALLOWED_SQL } from '../src/retrieval/acl.ts';
import { canReadPageRowAsMember } from '../../../scripts/bridge-page-read.mjs';
import { isFrench } from './text.mjs';

/** The rows of one half of the search: the fifty best of a list. */
export const LIST_LIMIT = 50;

/** The chunks of the fusion that go to the model. */
export const FUSED_LIMIT = 20;

/** The constant of the reciprocal rank fusion. */
export const RRF_K = 60;

/** The number of chunks of ONE page an answer quotes. */
export const MAX_CHUNKS_PER_PAGE = 3;

/** The languages of the chunks of the index. */
export interface LanguageMap {
	/** The ids of the chunks written in English. */
	english: string[];
	/** The ids of the chunks written in French. */
	french: string[];
}

/** One row of the fusion. */
export interface CandidateRow extends QueryResultRow {
	source_id: string;
	block_id: string | null;
	title: string;
	heading_path: string;
	content: string;
	score: number;
}

/** One page, as the read rule reads it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
}

/** The pages of the candidates, in one query: the ones that are not archived. */
const PAGES_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title
	from public.osionos_pages
	where id = any($1::uuid[]) and archived_at is null`;

/**
 * The language of every chunk of the index.
 *
 * The detector is the one of eval/text.mjs (isFrench), the one the corpus of
 * the golden set is checked with: a second detector would be a second truth.
 */
export async function languageMap(db: Pool): Promise<LanguageMap> {
	const rows = await db.query<{ id: string; title: string; heading_path: string; content: string }>(
		`select id, title, heading_path, content from public.ai_chunks where source_kind = 'page'`,
	);
	const english: string[] = [];
	const french: string[] = [];
	for (const row of rows.rows) {
		const text = `${row.title}\n${row.heading_path}\n${row.content}`;
		(isFrench(text) ? french : english).push(String(row.id));
	}
	return { english, french };
}

/** One list of the fusion: a lexical one or a vector one, maybe per language. */
export interface ListSpec {
	kind: 'lexical' | 'vector';
	/** The text of the query the list holds. */
	text: string;
	/** The vector of the list (the vector lists only). */
	vector: string;
	/** The language the list is restricted to, or null when it is not. */
	language: 'en' | 'fr' | null;
}

/** The statement of one list, with its own parameters. */
function listStatement(spec: ListSpec, index: number, params: unknown[], languages: LanguageMap): string {
	// The first two parameters of the statement are the ones of acl.ts (the
	// workspaces, then the user), so the lists start at the third.
	const paramsOf = (value: unknown): string => {
		params.push(value);
		return `$${params.length + 2}`;
	};
	const allowed = `${WORKSPACE_ALLOWED_SQL} and ${ROW_ALLOWED_SQL}`;
	if (spec.kind === 'lexical') {
		const text = paramsOf(spec.text);
		return `select * from (
			select ${index} as list_idx, c.workspace_id, c.id, c.source_id, c.block_id, c.title, c.heading_path, c.content,
			       row_number() over (order by ts_rank_cd(c.tsv, websearch_to_tsquery('simple', ${text})) desc, c.id) as rn
			from public.ai_chunks c
			where c.source_kind = 'page' and ${allowed} and c.tsv @@ websearch_to_tsquery('simple', ${text})
			order by ts_rank_cd(c.tsv, websearch_to_tsquery('simple', ${text})) desc, c.id
			limit ${LIST_LIMIT}
		) list_${index}`;
	}
	const vector = paramsOf(spec.vector);
	const ids = spec.language
		? ` and c.id = any(${paramsOf(spec.language === 'fr' ? languages.french : languages.english)}::bigint[])`
		: '';
	return `select * from (
		select ${index} as list_idx, c.workspace_id, c.id, c.source_id, c.block_id, c.title, c.heading_path, c.content,
		       row_number() over (order by c.embedding <=> ${vector}::halfvec, c.id) as rn
		from public.ai_chunks c
		where c.source_kind = 'page' and ${allowed}${ids}
		order by c.embedding <=> ${vector}::halfvec, c.id
		limit ${LIST_LIMIT}
	) list_${index}`;
}

/**
 * The fusion of the lists: the same RRF as the one of the service.
 *
 * The first two parameters are the ones of acl.ts: the workspaces, then the
 * user. The predicate of the service is imported, not rewritten.
 */
export function fusionSql(
	lists: readonly ListSpec[],
	languages: LanguageMap,
): { sql: string; params: unknown[] } {
	const params: unknown[] = [];
	const statements = lists.map((spec, index) => listStatement(spec, index, params, languages));
	const sql = `with lists as (
		${statements.join('\n\t\tunion all\n\t\t')}
	)
	select source_id, block_id, title, heading_path, content, sum(1.0 / (${RRF_K} + rn)) as score
	from lists
	group by workspace_id, id, source_id, block_id, title, heading_path, content
	order by score desc, id
	limit ${FUSED_LIMIT}`;
	return { sql, params };
}

/** The candidates that survive the bridge's own rule. */
export async function readable(
	db: Pool,
	candidates: readonly CandidateRow[],
	user: AuthUser,
	workspaces: readonly string[],
	limit: number,
): Promise<{ pageId: string; title: string; score: number }[]> {
	if (candidates.length === 0) return [];
	const ids = [...new Set(candidates.map((candidate) => candidate.source_id))];
	const result = await db.query<PageRow>(PAGES_SQL, [ids]);
	const pages = new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row]));
	const perPage = new Map<string, number>();
	const kept: { pageId: string; title: string; score: number }[] = [];
	for (const candidate of candidates) {
		if (kept.length >= limit) break;
		const page = pages.get(String(candidate.source_id).toLowerCase());
		if (!page) continue;
		if (!canReadPageRowAsMember(page, user.userId, workspaces)) continue;
		const count = perPage.get(page.id) ?? 0;
		if (count >= MAX_CHUNKS_PER_PAGE) continue;
		perPage.set(page.id, count + 1);
		kept.push({
			pageId: String(page.id),
			title: String(page.title ?? '') || candidate.title,
			score: Number(candidate.score),
		});
	}
	return kept;
}
