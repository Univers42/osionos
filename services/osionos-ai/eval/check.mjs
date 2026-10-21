/* ************************************************************************** */
/*                                                                            */
/*   check.mjs                                          the self-consistency   */
/*                                                                            */
/*   The gate of the golden set. It proves the corpus and the questions      */
/*   agree with each other before a retrieval runner ever sees them:         */
/*                                                                            */
/*     - 40 pages, 50 questions, the kind and language counts of the brief;  */
/*     - every expected slug exists and is not archived;                     */
/*     - every rare term of a question lives in its expected page only;      */
/*     - every paraphrase question shares no content word with its answer;    */
/*     - every multi question is answered by two pages;                       */
/*     - every negative question names something the corpus never mentions;   */
/*     - every acl question agrees with the bridge's read rule, including    */
/*       the rule that an archived page is out of the index.                 */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/* ************************************************************************** */

import console from "node:console";
import process from "node:process";
import { canReadPageRowAsMember } from "../../../scripts/bridge-page-read.mjs";
import {
	USER_IDS,
	USER_KEYS,
	WORKSPACE_ID,
	answerSentence,
	isFrench,
	pageId,
	properNouns,
	rareTerms,
	readCorpus,
	readGolden,
	sharedContentWords,
} from "./lib.mjs";

const EXPECTED_PAGES = 40;
const EXPECTED_QUESTIONS = 50;
const EXPECTED_KINDS = { lexical: 12, paraphrase: 14, multi: 8, fr: 6, negative: 4, acl: 6 };
const EXPECTED_LANGS = { en: 44, fr: 6 };
const EXPECTED_ARCHIVED = 2;
const EXPECTED_MIX = { sales: 12, meetings: 8, hr: 6, specs: 6, runbooks: 4, french: 4 };
const FRONT_MATTER_KEYS = ["title", "visibility", "owner", "collaborators", "archived"];
const VISIBILITIES = new Set(["private", "shared", "public"]);
const LIST_TYPES = new Set(["bulleted_list", "numbered_list", "to_do"]);
const MIN_WORDS = 300;
const MAX_WORDS = 1200;

const failures = [];
const fail = (message) => failures.push(message);

const pages = readCorpus();
const questions = readGolden();
const bySlug = new Map(pages.map((page) => [page.slug, page]));

// The marker of a question id: which page answers it, and with which sentence.
const markersById = new Map();
for (const page of pages) {
	for (const marker of page.markers) {
		for (const id of marker.ids) {
			if (!markersById.has(id)) markersById.set(id, []);
			markersById.get(id).push({ page, marker });
		}
	}
}

/** The row shape the bridge reads: owner, visibility, collaborators. */
function pageRow(page) {
	return {
		id: pageId(page.slug),
		workspace_id: WORKSPACE_ID,
		owner_id: USER_IDS[page.meta.owner],
		visibility: page.meta.visibility,
		collaborators: (page.meta.collaborators ?? []).map((entry) => ({
			userId: USER_IDS[entry.user],
			role: entry.role,
		})),
		archived_at: page.archived ? "2026-01-05T09:00:00Z" : null,
	};
}

/**
 * Can this member read the page? The bridge's rule for a workspace member,
 * plus the retrieval rule: an archived page has no chunks in the index, so it
 * answers nothing to anybody.
 */
function canRead(page, asker) {
	if (page.archived) return false;
	return canReadPageRowAsMember(pageRow(page), USER_IDS[asker], [WORKSPACE_ID]);
}

/** The pages a term appears in, case insensitively. */
function pagesWithTerm(term) {
	const needle = term.toLowerCase();
	return pages.filter((page) => page.text.toLowerCase().includes(needle)).map((page) => page.slug);
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

if (pages.length !== EXPECTED_PAGES) {
	fail(`corpus: ${pages.length} pages, expected ${EXPECTED_PAGES}`);
}

const archived = pages.filter((page) => page.archived);
if (archived.length !== EXPECTED_ARCHIVED) {
	fail(`corpus: ${archived.length} archived pages, expected ${EXPECTED_ARCHIVED}`);
}

const withTable = pages.filter((page) => page.blocks.some((block) => block.type === "table_block"));
if (withTable.length < 8) {
	fail(`corpus: only ${withTable.length} pages carry a table, expected at least 8`);
}

const mix = { sales: 0, meetings: 0, hr: 0, specs: 0, runbooks: 0, french: 0 };
for (const page of pages) {
	if (page.slug.startsWith("deal-") || page.slug.startsWith("sales-")) mix.sales += 1;
	else if (page.slug.startsWith("meeting-")) mix.meetings += 1;
	else if (page.slug.startsWith("hr-")) mix.hr += 1;
	else if (page.slug.startsWith("spec-")) mix.specs += 1;
	else if (page.slug.startsWith("runbook-")) mix.runbooks += 1;
	if (isFrench(page.text)) mix.french += 1;
}
for (const [key, expected] of Object.entries(EXPECTED_MIX)) {
	if (mix[key] !== expected) fail(`corpus mix: ${key} is ${mix[key]}, expected ${expected}`);
}

for (const page of pages) {
	const keys = Object.keys(page.meta);
	for (const key of FRONT_MATTER_KEYS) {
		if (!keys.includes(key)) fail(`${page.slug}: front matter is missing ${key}`);
	}
	for (const key of keys) {
		if (!FRONT_MATTER_KEYS.includes(key)) fail(`${page.slug}: front matter has an extra key ${key}`);
	}
	if (!VISIBILITIES.has(page.meta.visibility)) {
		fail(`${page.slug}: visibility ${page.meta.visibility} is not private, shared or public`);
	}
	if (!USER_KEYS.includes(page.meta.owner)) fail(`${page.slug}: owner ${page.meta.owner} is not one of the three users`);
	for (const entry of page.meta.collaborators ?? []) {
		if (!USER_KEYS.includes(entry.user)) fail(`${page.slug}: collaborator ${entry.user} is not one of the three users`);
		if (!entry.role) fail(`${page.slug}: collaborator ${entry.user} has no role`);
	}
	if (page.meta.archived !== true && page.meta.archived !== false) {
		fail(`${page.slug}: archived is not true or false`);
	}

	const words = page.text.split(/\s+/).filter(Boolean).length;
	if (words < MIN_WORDS || words > MAX_WORDS) {
		fail(`${page.slug}: ${words} words, expected ${MIN_WORDS}-${MAX_WORDS}`);
	}
	const types = page.blocks.map((block) => block.type);
	if (!types.includes("heading_2")) fail(`${page.slug}: no H2 heading`);
	if (!types.includes("heading_3")) fail(`${page.slug}: no H3 heading`);
	if (!types.some((type) => LIST_TYPES.has(type))) fail(`${page.slug}: no list`);
}

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------

if (questions.length !== EXPECTED_QUESTIONS) {
	fail(`questions: ${questions.length}, expected ${EXPECTED_QUESTIONS}`);
}

const kindCounts = {};
const langCounts = {};
const seenIds = new Set();
for (const question of questions) {
	for (const key of ["id", "q", "lang", "kind", "asker", "expected"]) {
		if (!(key in question)) fail(`${question.id ?? "?"}: missing ${key}`);
	}
	if (seenIds.has(question.id)) fail(`${question.id}: duplicate id`);
	seenIds.add(question.id);
	if (!Array.isArray(question.expected)) fail(`${question.id}: expected is not a list`);
	if (!USER_KEYS.includes(question.asker)) fail(`${question.id}: asker ${question.asker} is not one of the three users`);
	if (!["en", "fr"].includes(question.lang)) fail(`${question.id}: lang ${question.lang} is not en or fr`);
	if (!(question.kind in EXPECTED_KINDS)) fail(`${question.id}: kind ${question.kind} is not one of the six kinds`);
	kindCounts[question.kind] = (kindCounts[question.kind] ?? 0) + 1;
	langCounts[question.lang] = (langCounts[question.lang] ?? 0) + 1;
}
for (const [kind, expected] of Object.entries(EXPECTED_KINDS)) {
	if ((kindCounts[kind] ?? 0) !== expected) {
		fail(`questions: kind ${kind} is ${kindCounts[kind] ?? 0}, expected ${expected}`);
	}
}
for (const [lang, expected] of Object.entries(EXPECTED_LANGS)) {
	if ((langCounts[lang] ?? 0) !== expected) {
		fail(`questions: lang ${lang} is ${langCounts[lang] ?? 0}, expected ${expected}`);
	}
}

const frenchQuestions = questions.filter((question) => question.kind === "fr");
let crossLingual = 0;
let aclCannot = 0;
let aclBlocked = 0;
let aclArchived = 0;

for (const question of questions) {
	const id = question.id;
	const terms = rareTerms(question.q);

	// Every expected slug exists, and none of them is archived.
	for (const slug of question.expected) {
		if (!bySlug.has(slug)) {
			fail(`${id}: expected slug ${slug} does not exist`);
			continue;
		}
		if (bySlug.get(slug).archived) {
			fail(`${id}: expected slug ${slug} is archived`);
		}
	}

	// A rare term lives in the expected page and nowhere else.
	for (const term of terms) {
		const holders = pagesWithTerm(term);
		if (question.expected.length) {
			const expected = question.expected.filter((slug) => holders.includes(slug));
			if (!expected.length) fail(`${id}: rare term ${term} is in no expected page`);
			const elsewhere = holders.filter((slug) => !question.expected.includes(slug));
			if (elsewhere.length) fail(`${id}: rare term ${term} also appears in ${elsewhere.join(", ")}`);
		} else {
			const readable = holders.filter((slug) => canRead(bySlug.get(slug), question.asker));
			if (readable.length) fail(`${id}: rare term ${term} is readable in ${readable.join(", ")}`);
		}
	}

	const marked = markersById.get(id) ?? [];

	if (question.kind === "negative") {
		if (question.expected.length) fail(`${id}: a negative question expects pages`);
		for (const noun of properNouns(question.q)) {
			const holders = pagesWithTerm(noun);
			if (holders.length) fail(`${id}: invented name ${noun} also appears in ${holders.join(", ")}`);
		}
		continue;
	}

	if (question.kind === "acl") {
		if (marked.length !== 1) {
			fail(`${id}: expected exactly one marked answer page, found ${marked.length}`);
			continue;
		}
		const target = marked[0].page;
		const readable = canRead(target, question.asker);
		if (readable && question.expected.length !== 1) {
			fail(`${id}: the asker can read ${target.slug}, expected exactly that page`);
		}
		if (!readable && question.expected.length) {
			fail(`${id}: the asker cannot read ${target.slug}, expected no page`);
		}
		if (readable && question.expected[0] !== target.slug) {
			fail(`${id}: expected ${question.expected.join(", ")}, the only marked answer is ${target.slug}`);
		}
		if (!readable) {
			aclCannot += 1;
			if (target.archived) aclArchived += 1;
			else aclBlocked += 1;
		}
		continue;
	}

	// Every other kind is answered by a marked sentence in its expected page.
	if (!marked.length) {
		fail(`${id}: no marked answer sentence in the corpus`);
		continue;
	}
	for (const slug of question.expected) {
		if (!marked.some((entry) => entry.page.slug === slug)) {
			fail(`${id}: ${slug} carries no marked answer sentence`);
		}
	}
	const sentences = marked
		.filter((entry) => question.expected.includes(entry.page.slug))
		.map((entry) => answerSentence(entry.marker));

	const multi = question.expected.length > 1;
	const lexical = question.kind === "lexical" || (question.kind === "fr" && terms.length > 0);

	if (lexical) {
		for (const sentence of sentences) {
			const sentenceTerms = rareTerms(sentence);
			for (const term of terms) {
				if (!sentenceTerms.includes(term)) {
					fail(`${id}: the marked answer sentence does not contain ${term}`);
				}
			}
		}
		continue;
	}

	if (multi) {
		for (const sentence of sentences) {
			const shared = sharedContentWords(question.q, sentence);
			if (!shared.length) {
				fail(`${id}: the marked answer sentence shares no content word with the question`);
			}
		}
		continue;
	}

	for (const sentence of sentences) {
		const shared = sharedContentWords(question.q, sentence);
		if (shared.length) {
			fail(`${id}: the marked answer sentence shares ${shared.join(", ")} with the question`);
		}
	}
}

if (aclCannot < 2) fail(`acl: only ${aclCannot} questions are refused by the read rule, expected at least 2`);
if (!aclBlocked) fail("acl: no question is refused by the bridge rule on a readable page");
if (!aclArchived) fail("acl: no question is refused because the page is archived");

// The french bucket: two of the six ask about an english page.
for (const question of frenchQuestions) {
	const target = markersById.get(question.id)?.[0]?.page;
	if (!target) continue;
	if (!isFrench(target.text)) crossLingual += 1;
}
if (crossLingual !== 2) fail(`fr: ${crossLingual} questions ask in french about an english page, expected 2`);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("golden set check — services/osionos-ai/eval");
console.log(`corpus: ${pages.length} pages, ${withTable.length} with a table, ${archived.length} archived`);
console.log(`mix: sales ${mix.sales}, meetings ${mix.meetings}, hr ${mix.hr}, specs ${mix.specs}, runbooks ${mix.runbooks}, french ${mix.french}`);
console.log(`questions: ${questions.length}`);
console.log("kind table:");
for (const kind of Object.keys(EXPECTED_KINDS)) {
	const count = kindCounts[kind] ?? 0;
	console.log(`  ${kind.padEnd(11)} ${String(count).padStart(2)}  ${count === EXPECTED_KINDS[kind] ? "ok" : `expected ${EXPECTED_KINDS[kind]}`}`);
}
console.log(`lang: en ${langCounts.en ?? 0}, fr ${langCounts.fr ?? 0}`);
console.log(`acl: ${aclCannot} refused (${aclBlocked} by the bridge rule, ${aclArchived} archived), ${questions.filter((question) => question.kind === "acl").length - aclCannot} answered`);

if (failures.length) {
	console.log("");
	console.log(`FAIL — ${failures.length} problem(s):`);
	for (const message of failures) console.log(`  - ${message}`);
	process.exitCode = 1;
} else {
	console.log("");
	console.log("PASS — the corpus and the questions agree");
}
