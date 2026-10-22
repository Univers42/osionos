/* ************************************************************************** */
/*                                                                            */
/*   database.test.mjs              the tests of the import in the database   */
/*                                                                            */
/*   The lane test the brief asks for: the rows of an imported batch are in   */
/*   the bulk lane (1), and a page that is edited afterwards is back in the   */
/*   lane of a person (0). And the round trip of the nasty strings: what the  */
/*   SQL writes is what the database keeps.                                   */
/*                                                                            */
/*   The tests need a throwaway Postgres with the RAG migration on it, and    */
/*   they are skipped when there is none:                                   */
/*                                                                            */
/*     WIKI_TEST_DATABASE_URL=postgres://postgres:ai_test_password@ai-wiki-  */
/*     db:5432/osionos_ai_test node --test services/osionos-ai/eval/wiki/   */
/*                                                                            */
/*   No dependencies of its own: the driver of the service (pg) is used, and */
/*   it is optional.                                                          */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { NASTY, OPTIONS, longArticle } from "./cases.mjs";
import { pageId } from "./pages.mjs";
import { batchSql, workspaceSql } from "./import.mjs";

const DATABASE_URL = process.env.WIKI_TEST_DATABASE_URL ?? process.env.OSIONOS_AI_DATABASE_URL ?? "";

/** The driver of the service: it is optional, the pure tests do not need it. */
const pgModule = await import("pg").catch(() => null);
const pg = pgModule === null ? null : (pgModule.default ?? pgModule);

/** The client of the throwaway database: null when there is none. */
let client = null;
if (pg !== null && DATABASE_URL.length > 0) {
	try {
		client = new pg.Client({ connectionString: DATABASE_URL });
		await client.connect();
	} catch {
		client = null;
	}
}

/** The rows of a query. */
async function query(sql, params = []) {
	const result = await client.query(sql, params);
	return result.rows;
}

/** The first value of a query. */
async function value(sql, params = []) {
	const rows = await query(sql, params);
	return rows[0]?.value;
}

/** Whether the RAG migration is on the database. */
async function hasRag() {
	try {
		const answer = await value(
			"select (to_regclass('public.ai_index_queue') is not null and to_regclass('public.ai_chunks') is not null) as value",
		);
		return answer === true;
	} catch {
		return false;
	}
}

const RAG = client !== null ? await hasRag() : false;

after(async () => {
	if (client !== null) await client.end();
});

describe("the import in the database", { skip: RAG ? false : "no throwaway database" }, () => {
	it("puts the rows of a batch in the bulk lane, and an edit back in the lane of a person", async () => {
		const articles = [longArticle("Lane one"), longArticle("Lane two")];
		const ids = articles.map((one) => pageId(one.title));
		await query("delete from public.osionos_pages where id = any($1::uuid[])", [ids]);
		await query(workspaceSql(OPTIONS));
		await query(batchSql(articles, OPTIONS));

		const lanes = await query(
			"select priority as value from public.ai_index_queue where page_id = any($1::uuid[]) order by page_id",
			[ids],
		);
		assert.deepEqual(
			lanes.map((row) => Number(row.value)),
			[1, 1],
			"every row of the batch is in the bulk lane",
		);

		// A person edits one of the pages: the trigger puts it back in lane 0.
		await query("update public.osionos_pages set title = 'Lane one, edited' where id = $1", [ids[0]]);
		const lane = await value("select priority as value from public.ai_index_queue where page_id = $1", [
			ids[0],
		]);
		assert.equal(lane, 0, "the edited page is in the lane of a person");

		await query("delete from public.osionos_pages where id = any($1::uuid[])", [ids]);
	});

	it("brings the nasty strings back as they were", async () => {
		const articles = NASTY.map((value) => longArticle(value));
		const ids = articles.map((one) => pageId(one.title));
		await query("delete from public.osionos_pages where id = any($1::uuid[])", [ids]);
		await query(batchSql(articles, OPTIONS));
		for (const [index, one] of articles.entries()) {
			const rows = await query(
				"select title, content->1->>'content' as body from public.osionos_pages where id = $1",
				[ids[index]],
			);
			assert.equal(rows[0]?.title, one.title, `the title of ${JSON.stringify(one.title)} came back`);
			assert.equal(
				rows[0]?.body,
				one.sections[0].paragraphs[0],
				`the text of ${JSON.stringify(one.title)} came back`,
			);
		}
		await query("delete from public.osionos_pages where id = any($1::uuid[])", [ids]);
	});
});
