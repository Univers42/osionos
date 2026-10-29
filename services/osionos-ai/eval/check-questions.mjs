/* ************************************************************************** */
/*                                                                            */
/*   check-questions.mjs                    the questions half of the gate   */
/*                                                                            */
/*   The questions of the golden set: the counts of the brief, and the rule   */
/*   of every kind:                                                           */
/*                                                                            */
/*     - lexical: a rare exact term (a SKU, a codename) that lives in the   */
/*       expected page only, and in its marked sentence;                     */
/*     - paraphrase: the question shares no content word with the answer,   */
/*       so the vector side has to carry it;                                 */
/*     - multi: two pages answer it, and both are listed;                   */
/*     - fr: asked in French; the answer is on a French page, and the       */
/*       question shares no content word with the marked sentence;           */
/*     - xl: asked in one language, answered by a page written in the       */
/*       other one. The lexical half must have no way in: no content word   */
/*       of the question is a token of the expected page;                    */
/*     - negative: nothing in the corpus answers it;                         */
/*     - acl: the only answer is on a page the asker may not read.           */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { answerSentence, contentWords, isFrench, properNouns, rareTerms, sharedContentWords } from "./text.mjs";
import { bySlug, canRead, fail, markersById, pagesWithTerm, questions, tokens } from "./check-lib.mjs";

const EXPECTED_QUESTIONS = 68;
const EXPECTED_KINDS = { lexical: 12, paraphrase: 14, multi: 8, fr: 10, xl: 14, negative: 4, acl: 6 };
const EXPECTED_LANGS = { en: 48, fr: 20 };
const USER_KEYS = ["u_ana", "u_ben", "u_chloe"];
/** The cross-lingual questions: ten asked in French, four asked in English. */
const EXPECTED_XL = { fr: 10, en: 4 };

/** The counts of the gate, for the report. */
export const kindCounts = {};
export const langCounts = {};
/** The french questions whose answer is on an English page. */
export let crossLingual = 0;
/** The cross-lingual questions, by the language of the question. */
export const xlCounts = { fr: 0, en: 0 };
/** The acl questions that are refused, and why. */
export const acl = { cannot: 0, blocked: 0, archived: 0, answered: 0 };

/** The rules of the questions. */
export function checkQuestions() {
	checkCounts();
	checkEveryQuestion();
	checkAcl();
	checkFrenchBucket();
}

/** The counts of the brief: the number of questions, of kinds and of languages. */
function checkCounts() {
	if (questions.length !== EXPECTED_QUESTIONS) {
		fail(`questions: ${questions.length}, expected ${EXPECTED_QUESTIONS}`);
	}
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
		// The language of the question is not only declared: the detector of
		// the corpus must agree with it.
		if (question.lang === "fr" && !isFrench(question.q)) {
			fail(`${question.id}: the question is declared french, and the detector does not see it as french`);
		}
		if (question.lang === "en" && isFrench(question.q)) {
			fail(`${question.id}: the question is declared english, and the detector sees it as french`);
		}
		if (!(question.kind in EXPECTED_KINDS)) fail(`${question.id}: kind ${question.kind} is not one of the kinds`);
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
}

/** The rules of every kind, question by question. */
function checkEveryQuestion() {
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

		// A rare term lives in the expected page and nowhere else. A
		// cross-lingual question must not carry one at all: the term would
		// give the lexical half a way into the answer, whatever the language.
		if (question.kind === "xl") {
			if (terms.length) fail(`${id}: a cross-lingual question carries the rare term ${terms.join(", ")}`);
		} else {
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
			checkAclQuestion(question, marked);
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

		if (question.kind === "xl") {
			checkCrossLingual(question, marked, sentences);
			continue;
		}

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
}

/**
 * The rule of a cross-lingual question: it is asked in one language and
 * answered by a page written in the other one, and the lexical half has no
 * way in — no content word of the question is a token of the expected page.
 */
function checkCrossLingual(question, marked, sentences) {
	const id = question.id;
	if (marked.length !== 1) {
		fail(`${id}: a cross-lingual question is answered by one page, found ${marked.length}`);
		return;
	}
	const page = marked[0].page;
	const questionFrench = question.lang === "fr";
	const pageFrench = isFrench(page.text);
	if (questionFrench === pageFrench) {
		fail(`${id}: the question is ${question.lang} and the answer is on a ${pageFrench ? "french" : "english"} page`);
	}
	xlCounts[question.lang] = (xlCounts[question.lang] ?? 0) + 1;
	const pageTokens = tokens(page.text);
	for (const word of contentWords(question.q)) {
		if (pageTokens.has(word)) {
			fail(`${id}: the word ${word} of the question is a token of ${page.slug} — the lexical half has a way in`);
		}
	}
	for (const sentence of sentences) {
		const shared = sharedContentWords(question.q, sentence);
		if (shared.length) {
			fail(`${id}: the marked answer sentence shares ${shared.join(", ")} with the question`);
		}
	}
}

/** The rule of an acl question: the read rule decides what it may expect. */
function checkAclQuestion(question, marked) {
	const id = question.id;
	if (marked.length !== 1) {
		fail(`${id}: expected exactly one marked answer page, found ${marked.length}`);
		return;
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
		acl.cannot += 1;
		if (target.archived) acl.archived += 1;
		else acl.blocked += 1;
	} else {
		acl.answered += 1;
	}
}

/** The acl questions: some are refused, and they must be refused for a reason. */
function checkAcl() {
	if (acl.cannot < 2) fail(`acl: only ${acl.cannot} questions are refused by the read rule, expected at least 2`);
	if (!acl.blocked) fail("acl: no question is refused by the bridge rule on a readable page");
	if (!acl.archived) fail("acl: no question is refused because the page is archived");
}

/**
 * The french bucket: two of the ten ask about an English page, and the eight
 * others ask about a French one. The cross-lingual bucket holds ten
 * questions asked in French and four asked in English.
 */
function checkFrenchBucket() {
	const frenchQuestions = questions.filter((question) => question.kind === "fr");
	for (const question of frenchQuestions) {
		const target = markersById.get(question.id)?.[0]?.page;
		if (!target) continue;
		if (!isFrench(target.text)) crossLingual += 1;
	}
	if (crossLingual !== 2) fail(`fr: ${crossLingual} questions ask in french about an english page, expected 2`);
	for (const [lang, expected] of Object.entries(EXPECTED_XL)) {
		if ((xlCounts[lang] ?? 0) !== expected) {
			fail(`xl: ${xlCounts[lang] ?? 0} questions asked in ${lang}, expected ${expected}`);
		}
	}
}
