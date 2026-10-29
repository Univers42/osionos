/* ************************************************************************** */
/*                                                                            */
/*   golden.test.mjs                 the gate of the 200-question wiki set    */
/*                                                                            */
/*   Checks the committed golden-wiki.jsonl (shape, split, ids, duplicates)   */
/*   and the pure parts of the generator (seed, section pick, copy check).    */
/*   It does not check that a question is good: nobody has validated them.    */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ANSWERABLE, GOLDEN_FILE, UNANSWERABLE, copiesPassage, mulberry32, parseDraft, pickSection, sectionsOf, shuffled } from "./golden.mjs";
import { pageId } from "./pages.mjs";

const lines = readFileSync(GOLDEN_FILE, "utf8").split("\n").filter((line) => line.length > 0);
const questions = lines.map((line) => JSON.parse(line));
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("golden-wiki.jsonl", () => {
	it("holds 200 questions with unique ids", () => {
		assert.equal(questions.length, ANSWERABLE + UNANSWERABLE);
		assert.equal(new Set(questions.map((question) => question.id)).size, 200);
	});

	it("splits 160 answerable and 40 unanswerable, with expected pages only on the first", () => {
		const answerable = questions.filter((question) => question.kind === "answerable");
		const unanswerable = questions.filter((question) => question.kind === "unanswerable");
		assert.equal(answerable.length, ANSWERABLE);
		assert.equal(unanswerable.length, UNANSWERABLE);
		for (const question of answerable) assert.equal(question.expected.length, 1);
		for (const question of unanswerable) assert.deepEqual(question.expected, []);
	});

	it("names every expected page by the uuid v5 of its source title", () => {
		for (const question of questions.filter((entry) => entry.kind === "answerable")) {
			assert.match(question.expected[0], UUID_V5, question.id);
			assert.equal(question.expected[0], pageId(question.source_title), question.id);
		}
	});

	it("has no duplicate question text, and says nobody validated it", () => {
		assert.equal(new Set(questions.map((question) => question.q.toLowerCase())).size, 200);
		for (const question of questions) {
			assert.equal(question.validated_by, null, question.id);
			assert.match(question.drafted_by, /^Qwen3-4B-Instruct-2507 Q\S+ GGUF [0-9a-f]{64}$/, question.id);
		}
	});

	it("never repeats the title of the article in an answerable question", () => {
		for (const question of questions.filter((entry) => entry.kind === "answerable")) {
			assert.ok(!question.q.toLowerCase().includes(question.source_title.toLowerCase()), question.id);
		}
	});
});

describe("the generator", () => {
	it("draws the same numbers from the same seed", () => {
		const first = mulberry32(42);
		const second = mulberry32(42);
		assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
		assert.deepEqual(shuffled([1, 2, 3, 4, 5, 6], mulberry32(42)), shuffled([1, 2, 3, 4, 5, 6], mulberry32(42)));
	});

	it("cuts sections at headings and leaves the attribution out", () => {
		const blocks = [
			{ type: "paragraph", content: "lead text" },
			{ type: "heading_2", content: "History" },
			{ type: "paragraph", content: "a".repeat(300) },
			{ type: "paragraph", content: "Source: Wikipedia, 'X', https://x, CC BY-SA 4.0" },
		];
		assert.deepEqual(sectionsOf(blocks).map((section) => section.heading), ["", "History"]);
		assert.equal(sectionsOf(blocks)[1].text, "a".repeat(300));
		assert.equal(pickSection(blocks, mulberry32(1)).heading, "History");
		assert.equal(pickSection([{ type: "paragraph", content: "short" }], mulberry32(1)), null);
	});

	it("flags a question that copies 7 words of the passage", () => {
		const passage = "The quick brown fox jumps over the lazy dog near the river bank.";
		assert.equal(copiesPassage("Does the quick brown fox jumps over the lazy dog?", passage), true);
		assert.equal(copiesPassage("What does the fox do near the river?", passage), false);
	});

	it("reads the JSON object out of a reply and refuses an empty one", () => {
		assert.deepEqual(parseDraft('x {"question":"Q?","answer":"A."} y'), { question: "Q?", answer: "A." });
		assert.equal(parseDraft('{"question":"","answer":"A."}'), null);
		assert.equal(parseDraft("no json"), null);
	});
});
