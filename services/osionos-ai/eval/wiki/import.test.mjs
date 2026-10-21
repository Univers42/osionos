/* ************************************************************************** */
/*                                                                            */
/*   import.test.mjs                  the tests of the Wikipedia import       */
/*                                                                            */
/*   The pure tests: the blocks of a page, the id of a page, the articles    */
/*   that are not imported, and the SQL that is written. The tests of the    */
/*   database are in database.test.mjs.                                       */
/*                                                                            */
/*   No dependencies of its own. Node 22.                                    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NASTY, article, longArticle } from "./cases.mjs";
import {
	MIN_ARTICLE_CHARS,
	WORKSPACE_NAME,
	attribution,
	blocksOf,
	jsonb,
	pageId,
	quote,
	skipReason,
} from "./pages.mjs";
import { batchSql, workspaceSql } from "./import.mjs";
import { OPTIONS } from "./cases.mjs";

describe("the blocks of a Wikipedia page", () => {
	it("holds a heading per section and a paragraph per paragraph", () => {
		const blocks = blocksOf({
			title: "April",
			url: "https://simple.wikipedia.org/wiki/April",
			sections: [
				{ heading: "", level: 2, paragraphs: ["The lead of the article."] },
				{ heading: "History", level: 2, paragraphs: ["The first paragraph.", "The second."] },
				{ heading: "Early years", level: 3, paragraphs: ["A subsection."] },
			],
		});
		assert.deepEqual(
			blocks.map((block) => block.type),
			["paragraph", "heading_2", "paragraph", "paragraph", "heading_3", "paragraph", "paragraph"],
		);
		assert.equal(blocks[0].content, "The lead of the article.");
		assert.equal(blocks[1].content, "History");
		assert.equal(blocks[4].content, "Early years");
		assert.deepEqual(
			blocks.map((block) => block.id),
			["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
		);
	});

	it("ends with the attribution of the licence", () => {
		const blocks = blocksOf(article("April", ["The text."], "History"));
		const last = blocks[blocks.length - 1];
		assert.equal(last.type, "paragraph");
		assert.equal(
			last.content,
			"Source: Wikipedia, 'April', https://simple.wikipedia.org/wiki/April, CC BY-SA 4.0",
		);
		assert.equal(attribution(article("April")), last.content);
	});

	it("names a level 3 section as a heading_3 and the others as a heading_2", () => {
		const blocks = blocksOf({
			title: "T",
			url: "u",
			sections: [
				{ heading: "One", level: 2, paragraphs: [] },
				{ heading: "Two", level: 3, paragraphs: [] },
				{ heading: "Three", level: 9, paragraphs: [] },
			],
		});
		assert.deepEqual(
			blocks.filter((block) => block.type.startsWith("heading")).map((block) => block.type),
			["heading_2", "heading_3", "heading_3"],
		);
	});
});

describe("the id of a Wikipedia page", () => {
	it("is a uuid v5 of the namespace and the title", () => {
		const id = pageId("April");
		assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		assert.equal(pageId("April"), id, "the same title gives the same id");
		assert.notEqual(pageId("May"), id, "another title gives another id");
		assert.notEqual(pageId("april"), id, "the case of the title matters");
	});

	it("is stable between two runs", () => {
		// The value is written down: a change of the namespace or of the
		// derivation would change every id, and a re-run would write a second
		// page for every article.
		assert.equal(pageId("April"), "7ed9de19-e14d-5187-b241-f687ef4c78b9");
	});
});

describe("the articles that are not imported", () => {
	it("skips a redirect: it has no text of its own", () => {
		assert.equal(skipReason(longArticle("Target")), null);
		assert.equal(skipReason({ title: "Redirect", url: "u", revision: "r", sections: [] }), "redirect");
		assert.equal(
			skipReason({
				title: "Redirect",
				url: "u",
				revision: "r",
				sections: [{ heading: "", level: 2, paragraphs: [] }],
			}),
			"redirect",
		);
	});

	it("skips a stub: it teaches nothing", () => {
		assert.equal(skipReason(article("Stub", ["Too short."])), "stub");
		assert.equal(skipReason(article("Long enough", ["A".repeat(MIN_ARTICLE_CHARS)])), null);
	});

	it("skips a disambiguation page: it is a list of other articles", () => {
		assert.equal(skipReason(article("Boil", ["Boil might mean:", "A".repeat(400)])), "disambiguation");
		assert.equal(skipReason(article("Contact", ["Contact may refer to: X."])), "disambiguation");
	});

	it("keeps an article whose lead only mentions the words", () => {
		assert.equal(
			skipReason(article("Life", ["Life is a concept in biology. It may refer to a life.", "A".repeat(400)])),
			null,
		);
	});
});

describe("the SQL of the import", () => {
	it("quotes the nasty strings so that they come back as they were", () => {
		for (const value of NASTY) {
			const literal = quote(value);
			assert.equal(literal[0], "'", "the literal opens with a quote");
			assert.equal(literal.at(-1), "'", "the literal ends with a quote");
			assert.equal(
				literal.slice(1, -1).replace(/''/g, "'"),
				value,
				`the literal of ${JSON.stringify(value)} holds the value`,
			);
		}
	});

	it("quotes a jsonb payload with a quote, never with a dollar-quote tag", () => {
		const payload = jsonb({ title: "$j$ and it's a test" });
		assert.ok(payload.startsWith("'"), "the payload is a quoted literal");
		assert.ok(payload.endsWith("::jsonb"), "the payload is cast to jsonb");
		assert.ok(!/^\$[a-zA-Z_]*\$/.test(payload), "the literal is not a dollar-quote");
		const inner = payload.slice(1, payload.lastIndexOf("'::jsonb")).replace(/''/g, "'");
		assert.deepEqual(JSON.parse(inner), { title: "$j$ and it's a test" });
	});

	it("writes the pages and the lane in the same transaction", () => {
		const articles = [longArticle("Lane one"), longArticle("Lane two")];
		const sql = batchSql(articles, OPTIONS);
		const begin = sql.indexOf("BEGIN;");
		const inserts = sql.indexOf("INSERT INTO public.osionos_pages");
		const update = sql.indexOf("UPDATE public.ai_index_queue SET priority = 1");
		const commit = sql.indexOf("COMMIT;");
		assert.ok(begin >= 0 && begin < inserts, "the transaction opens before the pages");
		assert.ok(inserts < update, "the pages are written before the lane");
		assert.ok(update < commit, "the lane is moved before the commit");
		for (const one of articles) {
			assert.ok(sql.includes(pageId(one.title)), "the id of the page is in the statement");
		}
	});

	it("writes the workspace and its owner idempotently", () => {
		const sql = workspaceSql(OPTIONS);
		assert.ok(sql.includes("INSERT INTO public.osionos_workspaces"));
		assert.ok(sql.includes("ON CONFLICT (id) DO UPDATE"));
		assert.ok(sql.includes("INSERT INTO public.osionos_workspace_members"));
		assert.ok(sql.includes("ON CONFLICT (workspace_id, user_id) DO UPDATE"));
		assert.ok(sql.includes(`'${WORKSPACE_NAME}'`));
	});
});
