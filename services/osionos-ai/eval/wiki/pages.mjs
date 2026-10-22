/* ************************************************************************** */
/*                                                                            */
/*   pages.mjs                     the shape of a Wikipedia page              */
/*                                                                            */
/*   The pure part of the import: the blocks of a page, its id, the SQL       */
/*   literal of a value, and the articles that are not imported.              */
/*                                                                            */
/*   The blocks are the shape osionos_pages.content holds: an array of       */
/*   blocks, each one { id, type, content }. A section is a heading_2 or a   */
/*   heading_3 (the two the indexer opens a section on), a paragraph is a    */
/*   paragraph, and the last block of every page is the attribution:         */
/*   Simple English Wikipedia is CC BY-SA 4.0, and the licence asks for it.   */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/* ************************************************************************** */

import { uuid5 } from "../lib.mjs";

/** The namespace of the pages of Wikipedia: the article title under it. */
const PAGE_NAMESPACE = "page:simplewiki";

/** The workspace of the import: one, and its name is written in the row. */
export const WORKSPACE_NAME = "Wikipedia (Simple English)";
export const WORKSPACE_SLUG = "wikipedia-simple-english";
export const WORKSPACE_ID = uuid5("workspace:wikipedia-simple-english");

/** The visibility of the pages: shared with the workspace, and with nobody
 * else. scripts/bridge-page-read.mjs:69 — canReadPageRow is true for a page
 * whose visibility is 'shared', and canReadPageRowAsMember (the same file,
 * :82) asks for the membership of the caller first: a member of the
 * workspace reads the page, anybody else does not. */
export const VISIBILITY = "shared";

/** The smallest article that is imported: a stub teaches nothing. */
export const MIN_ARTICLE_CHARS = 300;

/** The pages of one transaction. */
export const BATCH_PAGES = 500;

/** The lane of the queue of an imported page: the bulk lane. */
export const BULK_LANE = 1;

/** The attribution of the last block of every page: CC BY-SA 4.0 asks for it. */
export function attribution(article) {
	return `Source: Wikipedia, '${article.title}', ${article.url}, CC BY-SA 4.0`;
}

/** The id of a page: uuid v5 of the namespace and the title of the article. */
export function pageId(title) {
	return uuid5(`${PAGE_NAMESPACE}:${title}`);
}

/**
 * A SQL string literal.
 *
 * The quotes are doubled and the backslashes are left alone: the script sets
 * standard_conforming_strings to on, so a backslash is a backslash. The
 * dollar-quote tag of seed.mjs is NOT used here: an article may hold the tag
 * in its text, and the tag cannot be escaped.
 */
export function quote(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

/** A jsonb literal: the JSON of the value, quoted and cast. */
export function jsonb(value) {
	return `${quote(JSON.stringify(value))}::jsonb`;
}

/**
 * The blocks of a page: a heading per section, a paragraph per paragraph,
 * and the attribution at the end.
 */
export function blocksOf(article) {
	const blocks = [];
	for (const section of article.sections ?? []) {
		const heading = typeof section.heading === "string" ? section.heading.trim() : "";
		if (heading.length > 0) {
			const level = Number(section.level) >= 3 ? 3 : 2;
			blocks.push({ type: `heading_${level}`, content: heading });
		}
		for (const paragraph of section.paragraphs ?? []) {
			const text = typeof paragraph === "string" ? paragraph.trim() : "";
			if (text.length > 0) blocks.push({ type: "paragraph", content: text });
		}
	}
	blocks.push({ type: "paragraph", content: attribution(article) });
	return blocks.map((block, index) => ({
		id: `b${index + 1}`,
		type: block.type,
		content: block.content,
	}));
}

/** The text of an article: its paragraphs, joined. */
export function textOf(article) {
	return (article.sections ?? [])
		.flatMap((section) => section.paragraphs ?? [])
		.filter((paragraph) => typeof paragraph === "string")
		.join("\n");
}

/** The lead of an article: the first paragraph there is. */
function leadOf(article) {
	for (const section of article.sections ?? []) {
		for (const paragraph of section.paragraphs ?? []) {
			if (typeof paragraph === "string" && paragraph.trim().length > 0) return paragraph.trim();
		}
	}
	return "";
}

/** A disambiguation page says so in the first sentence of its lead. */
const DISAMBIGUATION_LEAD =
	/\b(?:may|might|could|can)\s+(?:also\s+)?(?:refer\s+to|mean)\b|\bis\s+a\s+disambiguation\s+page\b/i;

/** The first sentence of the lead: "Boil might mean:" says it in one line. */
function leadSentence(article) {
	const lead = leadOf(article);
	const sentence = /^(.*?[.!?])(\s|$)/.exec(lead);
	return sentence ? sentence[1] : lead;
}

/**
 * The reason an article is not imported, or null when it is.
 *
 *   - no section at all: a redirect (the dump keeps them, and they have no
 *     text of their own) or an empty page;
 *   - a disambiguation page: a list of other articles, not an article;
 *   - a stub: less than MIN_ARTICLE_CHARS characters of text.
 */
export function skipReason(article, minChars = MIN_ARTICLE_CHARS) {
	if (typeof article?.title !== "string" || article.title.trim().length === 0) return "no-title";
	const sections = article.sections ?? [];
	if (!Array.isArray(sections) || sections.length === 0) return "redirect";
	const paragraphs = sections.flatMap((section) => section.paragraphs ?? []);
	if (!Array.isArray(paragraphs) || paragraphs.length === 0) return "redirect";
	if (DISAMBIGUATION_LEAD.test(leadSentence(article))) return "disambiguation";
	const characters = paragraphs.reduce((total, paragraph) => total + String(paragraph).length, 0);
	if (characters < minChars) return "stub";
	return null;
}
