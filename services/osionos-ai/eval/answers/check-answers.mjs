/* ************************************************************************** */
/*                                                                            */
/*   check-answers.mjs                 the answer set half of the gate        */
/*                                                                            */
/*   Machine checks on eval/answers/questions.jsonl:                          */
/*     - ids are unique and do not collide with golden ids;                   */
/*     - every expected page exists;                                           */
/*     - for an answerable question, a distinctive token of gold occurs in     */
/*       the text of at least one expected page;                               */
/*     - for an unanswerable question, its key entity (absent) occurs in no    */
/*       page;                                                                  */
/*     - the counts are exactly 200 questions, 40 unanswerable, 132           */
/*       llm-drafted.                                                          */
/*                                                                            */
/*   Caveat: a machine check proves that the fact is present, not that the    */
/*   question asks for it unambiguously. Human validation is still missing.   */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentWords, isFrench, rareTerms, properNouns } from "../text.mjs";
import { pages, bySlug } from "../check-lib.mjs";
import { readGolden } from "../lib.mjs";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = path.join(EVAL_DIR, "questions.jsonl");

/** The problems the check found. */
const failures = [];
const fail = (message) => failures.push(message);

/** Read the answer questions. */
function readAnswerQuestions() {
	const raw = readFileSync(QUESTIONS_PATH, "utf8");
	return raw
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line, index) => {
			let parsed;
			try {
				parsed = JSON.parse(line);
			} catch (error) {
				fail(`questions.jsonl line ${index + 1} is not JSON: ${error.message}`);
				return null;
			}
			return parsed;
		})
		.filter(Boolean);
}

/** The golden questions, loaded for unanswerable counting and id collision. */
const goldenQuestions = readGolden();

/** The golden ids, to detect collisions (only for non-reference questions). */
const goldenIds = new Set(goldenQuestions.map((q) => q.id));

/** Count unanswerable golden questions (negative + acl). */
const goldenUnanswerable = goldenQuestions.filter((q) => q.kind === "negative" || q.kind === "acl").length;

/** Jaccard similarity of two content-word sets. */
function jaccard(a, b) {
	if (a.size === 0 && b.size === 0) return 1;
	const intersection = [...a].filter((w) => b.has(w)).length;
	const union = a.size + b.size - intersection;
	return intersection / union;
}

/** Content word set of a question text. */
function contentWordSet(text) {
	return new Set(contentWords(text));
}

/** The text of a page, lowercased. */
function pageText(slug) {
	const page = bySlug.get(slug);
	return page ? page.text.toLowerCase() : "";
}

/** A distinctive token from gold: a rare term, a proper noun, or a number. */
function distinctiveToken(gold) {
	// Try rare terms first (SKUs, codes).
	const rare = rareTerms(gold);
	if (rare.length) return rare[0];
	// Then proper nouns.
	const nouns = properNouns(gold);
	if (nouns.length) return nouns[0];
	// Then content words.
	const words = contentWords(gold);
	if (words.length) return words[0];
	// Fall back to the first number.
	const numMatch = gold.match(/\d+/);
	if (numMatch) return numMatch[0];
	return null;
}

const questions = readAnswerQuestions();

// --- Count checks ---
if (questions.length !== 200) {
	fail(`questions: ${questions.length}, expected 200`);
}

// Unanswerable: new unanswerable + golden unanswerable (negative + acl)
const newUnanswerable = questions.filter((q) => q.answerable === false).length;
const totalUnanswerable = newUnanswerable + goldenUnanswerable;
if (totalUnanswerable !== 40) {
	fail(`unanswerable: ${totalUnanswerable} (new ${newUnanswerable} + golden ${goldenUnanswerable}), expected 40`);
}

const llmDrafted = questions.filter((q) => q.origin === "llm-drafted");
if (llmDrafted.length !== 132) {
	fail(`llm-drafted: ${llmDrafted.length}, expected 132`);
}

// --- ID checks ---
const seenIds = new Set();
for (const question of questions) {
	if (!question.id) {
		fail(`a question has no id`);
		continue;
	}
	// Golden references share ids with the golden set by design.
	if (question.ref === "golden") continue;
	if (seenIds.has(question.id)) {
		fail(`${question.id}: duplicate id`);
	}
	seenIds.add(question.id);
	if (goldenIds.has(question.id)) {
		fail(`${question.id}: collides with a golden id`);
	}
}
// Also check uniqueness among golden references.
const goldenRefIds = questions.filter((q) => q.ref === "golden").map((q) => q.id);
const seenGoldenRefIds = new Set();
for (const id of goldenRefIds) {
	if (seenGoldenRefIds.has(id)) fail(`${id}: duplicate golden reference id`);
	seenGoldenRefIds.add(id);
}

// --- Near-duplicate check: llm-drafted vs golden, and llm-drafted vs llm-drafted ---
// Caveat: word overlap misses a paraphrase that rewords a golden question ("Combien de pourcentage de
// remise…" against q66 scored under 0.6 and passed); only the human validation catches those.
const goldenWordSets = new Map(goldenQuestions.map((q) => [q.id, contentWordSet(q.q)]));
const llmDraftedQuestions = questions.filter((q) => q.origin === "llm-drafted");
const llmWordSets = new Map(llmDraftedQuestions.map((q) => [q.id, contentWordSet(q.q)]));

for (const q of llmDraftedQuestions) {
	const ws = llmWordSets.get(q.id);
	// vs golden
	for (const [gid, gws] of goldenWordSets) {
		const j = jaccard(ws, gws);
		if (j >= 0.6) {
			fail(`${q.id}: near-duplicate of golden ${gid} (J=${j.toFixed(2)})`);
		}
	}
	// vs other llm-drafted (only check pairs once, by id order)
	for (const [oid, ows] of llmWordSets) {
		if (oid >= q.id) continue;
		const j = jaccard(ws, ows);
		if (j >= 0.6) {
			fail(`${q.id}: near-duplicate of ${oid} (J=${j.toFixed(2)})`);
		}
	}
}

// --- Per-question checks ---
for (const question of questions) {
	const id = question.id ?? "?";

	// Skip golden references (they have no expected/gold/absent).
	if (question.ref === "golden") continue;

	// Every expected page exists.
	for (const slug of question.expected ?? []) {
		if (!bySlug.has(slug)) {
			fail(`${id}: expected slug ${slug} does not exist`);
		}
	}

	if (question.answerable === true) {
		// A distinctive token of gold occurs in at least one expected page.
		const token = distinctiveToken(question.gold ?? "");
		if (!token) {
			fail(`${id}: no distinctive token found in gold "${question.gold}"`);
			continue;
		}
		const tokenLower = token.toLowerCase();
		const found = (question.expected ?? []).some((slug) => {
			const text = pageText(slug);
			return text.includes(tokenLower);
		});
		if (!found) {
			fail(`${id}: distinctive token "${token}" of gold not found in any expected page`);
		}
	} else if (question.answerable === false) {
		// The absent entity occurs in no page.
		const term = question.absent;
		if (!term) {
			fail(`${id}: unanswerable question has no absent field`);
			continue;
		}
		const termLower = term.toLowerCase();
		const holders = pages.filter((page) => page.text.toLowerCase().includes(termLower));
		if (holders.length > 0) {
			fail(`${id}: absent term "${term}" appears in ${holders.map((p) => p.slug).join(", ")}`);
		}
	}
}

// --- Report ---
if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("check-answers: ok");