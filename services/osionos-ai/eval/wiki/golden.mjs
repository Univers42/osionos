/* ************************************************************************** */
/*                                                                            */
/*   golden.mjs                  the 200-question golden set of the wiki      */
/*                                                                            */
/*   160 answerable questions, each drafted by a local LLM from ONE section   */
/*   of an imported page, and 40 unanswerable ones, drafted from articles     */
/*   that were NOT imported. Seeded (mulberry32, seed 42): the same inputs    */
/*   draw the same pages. Nothing is human-validated, and the file says so:   */
/*   validated_by stays null.                                                 */
/*                                                                            */
/*   Caveat: the draw is deterministic, the LLM is only near-deterministic    */
/*   (temperature 0 on CPU, one slot): a re-run can word a question           */
/*   differently. The checks below drop a question that names the title or   */
/*   copies 7 words of the passage; they do not check that the question is   */
/*   good, or that its answer is right. "Unanswerable" is approximate:        */
/*   another imported article may still mention the subject.                  */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/*                                                                            */
/*   usage:                                                                  */
/*     node golden.mjs --pages pages.jsonl --articles articles.jsonl \        */
/*          --llm-url http://ai-m2-llm:8080 --model-label "<label>"          */
/*     pages.jsonl: one {"id","title","content"} per imported page, from     */
/*       psql -Atc "select row_to_json(p) from                              */
/*         (select id,title,content from osionos_pages order by id) p"       */
/* ************************************************************************** */

import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { skipReason } from "./pages.mjs";

export const SEED = 42;
export const ANSWERABLE = 160;
export const UNANSWERABLE = 40;
export const GOLDEN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden-wiki.jsonl");

/** A section is quoted whole to the LLM: not too short to ask about, not too long to fit. */
const SECTION_MIN_CHARS = 250;
const SECTION_MAX_CHARS = 1800;
const LEAD_CHARS = 1200;
const COPY_WORDS = 7;
const CALL_TIMEOUT_MS = 300_000;

/** mulberry32: a seeded generator in [0, 1). The only source of randomness here. */
export function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher-Yates on a copy, with the given generator. */
export function shuffled(items, random) {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const other = Math.floor(random() * (index + 1));
		[copy[index], copy[other]] = [copy[other], copy[index]];
	}
	return copy;
}

const ATTRIBUTION = /^Source: Wikipedia, /;

/**
 * The sections of a page: a heading_2/heading_3 block and the paragraphs
 * under it. The lead (before the first heading) has an empty heading. The
 * attribution block is never part of a section.
 */
export function sectionsOf(blocks) {
	const sections = [{ heading: "", paragraphs: [] }];
	for (const block of blocks ?? []) {
		if (block.type === "heading_2" || block.type === "heading_3") {
			sections.push({ heading: String(block.content), paragraphs: [] });
		} else if (block.type === "paragraph" && !ATTRIBUTION.test(String(block.content))) {
			sections.at(-1).paragraphs.push(String(block.content));
		}
	}
	return sections.map((section) => ({ heading: section.heading, text: section.paragraphs.join("\n") }));
}

/** The section to ask about: a headed one when there is one, else the lead. */
export function pickSection(blocks, random) {
	const fits = sectionsOf(blocks).filter(
		(section) => section.text.length >= SECTION_MIN_CHARS && section.text.length <= SECTION_MAX_CHARS,
	);
	const headed = fits.filter((section) => section.heading !== "");
	const pool = headed.length > 0 ? headed : fits;
	return pool.length === 0 ? null : pool[Math.floor(random() * pool.length)];
}

/** The words of a text, lowercased, without punctuation. */
function wordsOf(text) {
	return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** True when COPY_WORDS consecutive words of the question are in the passage. */
export function copiesPassage(question, passage) {
	const questionWords = wordsOf(question);
	const haystack = ` ${wordsOf(passage).join(" ")} `;
	for (let start = 0; start + COPY_WORDS <= questionWords.length; start += 1) {
		if (haystack.includes(` ${questionWords.slice(start, start + COPY_WORDS).join(" ")} `)) return true;
	}
	return false;
}

/** The {question, answer} of an LLM reply: the JSON object is found in the text. */
export function parseDraft(reply) {
	const start = reply.indexOf("{");
	const end = reply.lastIndexOf("}");
	if (start === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(reply.slice(start, end + 1));
		const question = String(parsed.question ?? "").trim();
		const answer = String(parsed.answer ?? "").trim();
		return question.length > 0 && answer.length > 0 ? { question, answer } : null;
	} catch {
		return null;
	}
}

const ANSWERABLE_SYSTEM = [
	"You write ONE exam question about a passage of an encyclopedia article.",
	"The question must be answerable only from the passage and understandable by someone who has not read it.",
	"Do not copy a sentence of the passage, and do not write the article title: describe the subject instead.",
	'Reply with JSON only: {"question": "...", "answer": "..."}. The answer is one short sentence.',
].join(" ");

const UNANSWERABLE_SYSTEM = [
	"You write ONE question that a curious reader could ask about the main subject of an encyclopedia article.",
	"The question names its subject and asks for a fact about it.",
	'Reply with JSON only: {"question": "...", "answer": "..."}. The answer is one short sentence.',
].join(" ");

/** One chat completion, temperature 0, JSON reply; null when the call or the reply is bad. */
async function draft(options, system, user) {
	try {
		const response = await fetch(`${options.llmUrl}/v1/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: options.llmModel,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				temperature: 0,
				max_tokens: 200,
				response_format: { type: "json_object" },
				chat_template_kwargs: { enable_thinking: false },
			}),
			signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const payload = await response.json();
		return parseDraft(String(payload.choices?.[0]?.message?.content ?? ""));
	} catch {
		return null;
	}
}

/** The 160 answerable questions, walking the pages in a seeded order until enough are kept. */
export async function answerableQuestions(pages, options, random) {
	const kept = [];
	const dropped = { no_section: 0, bad_reply: 0, title_in_question: 0, copied_passage: 0 };
	for (const page of shuffled(pages, random)) {
		if (kept.length >= options.answerable) break;
		const section = pickSection(page.content, random);
		if (!section) {
			dropped.no_section += 1;
			continue;
		}
		const heading = section.heading === "" ? "(introduction)" : section.heading;
		const reply = await draft(options, ANSWERABLE_SYSTEM, `Article: ${page.title}\nSection: ${heading}\n\n${section.text}`);
		if (!reply) dropped.bad_reply += 1;
		else if (reply.question.toLowerCase().includes(page.title.toLowerCase())) dropped.title_in_question += 1;
		else if (copiesPassage(reply.question, section.text)) dropped.copied_passage += 1;
		else kept.push({ q: reply.question, kind: "answerable", expected: [page.id], answer: reply.answer, source_title: page.title });
		console.error(`[golden] answerable ${kept.length}/${options.answerable} (dropped ${JSON.stringify(dropped)})`);
	}
	return { kept, dropped };
}

/**
 * The articles of the file that were not imported and would have been:
 * a reservoir of `size` (Algorithm R, seeded), so the file is read once and
 * only `size` articles are held.
 */
export async function reservoirOfUnimported(jsonlPath, importedTitles, size, random) {
	const reservoir = [];
	let seen = 0;
	const lines = createInterface({ input: createReadStream(jsonlPath, "utf8"), crlfDelay: Infinity });
	for await (const line of lines) {
		if (line.trim().length === 0) continue;
		const article = JSON.parse(line);
		if (importedTitles.has(article.title) || skipReason(article) !== null) continue;
		seen += 1;
		if (reservoir.length < size) reservoir.push(article);
		else {
			const slot = Math.floor(random() * seen);
			if (slot < size) reservoir[slot] = article;
		}
	}
	return shuffled(reservoir, random);
}

/** The 40 unanswerable questions, from articles that are not in the workspace. */
export async function unanswerableQuestions(candidates, options) {
	const kept = [];
	let badReply = 0;
	for (const article of candidates) {
		if (kept.length >= options.unanswerable) break;
		const lead = (article.sections ?? []).flatMap((section) => section.paragraphs ?? []).join("\n").slice(0, LEAD_CHARS);
		const reply = await draft(options, UNANSWERABLE_SYSTEM, `Article: ${article.title}\n\n${lead}`);
		if (!reply) badReply += 1;
		else kept.push({ q: reply.question, kind: "unanswerable", expected: [], answer: reply.answer, source_title: article.title });
		console.error(`[golden] unanswerable ${kept.length}/${options.unanswerable}`);
	}
	return { kept, badReply };
}

/** The JSONL line of a question, in the order of the brief. */
export function lineOf(index, question, label) {
	return JSON.stringify({
		id: `w${String(index + 1).padStart(3, "0")}`,
		q: question.q,
		lang: "en",
		kind: question.kind,
		expected: question.expected,
		answer: question.answer,
		source_title: question.source_title,
		drafted_by: label,
		validated_by: null,
	});
}

function parseArgs(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) values[argv[index].replace(/^--/, "")] = argv[index + 1];
	const required = ["pages", "articles", "llm-url", "model-label"];
	for (const name of required) if (!values[name]) throw new Error(`golden: --${name} is required`);
	return {
		pagesPath: values.pages,
		articlesPath: values.articles,
		llmUrl: values["llm-url"].replace(/\/+$/, ""),
		llmModel: values["llm-model"] ?? "qwen3-4b-instruct",
		label: values["model-label"],
		out: values.out ?? GOLDEN_FILE,
		answerable: Number(values.answerable ?? ANSWERABLE),
		unanswerable: Number(values.unanswerable ?? UNANSWERABLE),
	};
}

export async function main(argv) {
	const options = parseArgs(argv);
	const random = mulberry32(Number(process.env.GOLDEN_SEED ?? SEED));
	const pages = readFileSync(options.pagesPath, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line))
		.sort((left, right) => (left.id < right.id ? -1 : 1));
	const titles = new Set(pages.map((page) => page.title));
	console.error(`[golden] ${pages.length} imported pages`);
	const answerable = await answerableQuestions(pages, options, random);
	const candidates = await reservoirOfUnimported(options.articlesPath, titles, options.unanswerable * 3, random);
	const unanswerable = await unanswerableQuestions(candidates, options);
	const all = [...answerable.kept, ...unanswerable.kept];
	writeFileSync(options.out, `${all.map((question, index) => lineOf(index, question, options.label)).join("\n")}\n`);
	console.error(`[golden] wrote ${all.length} questions; dropped ${JSON.stringify(answerable.dropped)}, unanswerable bad replies ${unanswerable.badReply}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main(process.argv.slice(2));
}

