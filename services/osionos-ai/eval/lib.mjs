/* ************************************************************************** */
/*                                                                            */
/*   lib.mjs                                            shared helpers         */
/*                                                                            */
/*   The golden set of the AI-P3e brief: a synthetic 40-page workspace, 68    */
/*   questions with known answers, a seed generator and a self-consistency    */
/*   gate. This module holds the parsing both the seed and the check need:   */
/*   front matter, markdown -> blocks and uuid5 ids. The text helpers the     */
/*   question rules are written against live in text.mjs.                     */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CORPUS_DIR = path.join(EVAL_DIR, "corpus");
export const GOLDEN_PATH = path.join(EVAL_DIR, "golden.jsonl");

// RFC 4122 DNS namespace: the uuid5 salt, so every id below is derived and
// reproducible from a name alone.
const NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

/** uuid v5 (sha1, RFC 4122): deterministic, dependency free. */
export function uuid5(name) {
	const digest = createHash("sha1").update(NAMESPACE).update(name, "utf8").digest();
	const bytes = Buffer.from(digest.subarray(0, 16));
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const WORKSPACE_ID = uuid5("workspace:northwind-atelier");
export const USER_IDS = {
	u_ana: uuid5("user:u_ana"),
	u_ben: uuid5("user:u_ben"),
	u_chloe: uuid5("user:u_chloe"),
};
export const USER_KEYS = Object.keys(USER_IDS);

/** The page id of a corpus slug. */
export function pageId(slug) {
	return uuid5(`page:${slug}`);
}

const MARKER = /<!--\s*answer:([^>]*?)-->/g;

const LIST_TYPES = new Set(["bulleted_list", "numbered_list", "to_do"]);

/** Front matter: exactly the keys of the brief, plus the collaborators list. */
export function parseFrontMatter(raw) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) throw new Error("missing front matter");
	const meta = {};
	let listKey = null;
	for (const line of match[1].split(/\r?\n/)) {
		if (!line.trim()) continue;
		const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(line);
		if (item && listKey) {
			meta[listKey].push({ [item[1]]: item[2].trim() });
			continue;
		}
		// A continuation of the last list item: "role: editor".
		const nested = /^\s+(\w+):\s*(.*)$/.exec(line);
		if (nested && listKey && meta[listKey].length) {
			const last = meta[listKey][meta[listKey].length - 1];
			last[nested[1]] = nested[2].trim();
			continue;
		}
		const pair = /^(\w+):\s*(.*)$/.exec(line);
		if (!pair) continue;
		const [, key, value] = pair;
		if (value === "") {
			meta[key] = [];
			listKey = key;
			continue;
		}
		meta[key] = value === "true" || value === "false" ? value === "true" : value.trim();
		listKey = null;
	}
	return { meta, body: raw.slice(match[0].length) };
}

/** Markdown inline markers are not part of a block's stored text. */
function stripInline(text) {
	return text
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.trim();
}

function takeMarkers(text) {
	const ids = [];
	const stripped = text.replace(MARKER, (_, list) => {
		for (const id of list.split(",")) {
			const clean = id.trim();
			if (clean) ids.push(clean);
		}
		return "";
	});
	return { text: stripped.trim(), ids };
}

function tableCells(row) {
	return row
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function isDelimiterRow(cells) {
	return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * Markdown -> the real block shape of osionos_pages.content: headings,
 * paragraphs, lists, quotes, code and tables (tableData rows, no separator
 * row). Answer markers are stripped from the text and returned separately.
 */
export function parseBlocks(body) {
	const blocks = [];
	const markers = [];
	let paragraph = [];
	let table = [];
	let code = null;

	const flushParagraph = () => {
		if (!paragraph.length) return;
		const raw = paragraph.join(" ");
		const taken = takeMarkers(raw);
		if (taken.text) blocks.push({ type: "paragraph", content: taken.text });
		if (taken.ids.length) markers.push({ ids: taken.ids, text: taken.text });
		paragraph = [];
	};
	const flushTable = () => {
		if (!table.length) return;
		const rows = table.filter((cells) => !isDelimiterRow(cells));
		if (rows.length) blocks.push({ type: "table_block", content: "", tableData: rows });
		table = [];
	};

	for (const line of body.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (code) {
			if (trimmed.startsWith("```")) {
				blocks.push({ type: "code", content: code.lines.join("\n"), language: code.language });
				code = null;
			} else {
				code.lines.push(line);
			}
			continue;
		}
		if (trimmed.startsWith("```")) {
			flushParagraph();
			flushTable();
			code = { language: trimmed.slice(3).trim(), lines: [] };
			continue;
		}
		if (trimmed === "") {
			flushParagraph();
			flushTable();
			continue;
		}
		if (trimmed.startsWith("|")) {
			flushParagraph();
			table.push(tableCells(trimmed));
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
		if (heading) {
			flushParagraph();
			flushTable();
			blocks.push({ type: `heading_${heading[1].length}`, content: stripInline(heading[2]) });
			continue;
		}
		const todo = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
		if (todo) {
			flushParagraph();
			flushTable();
			blocks.push({ type: "to_do", content: stripInline(todo[2]), checked: todo[1].toLowerCase() === "x" });
			continue;
		}
		const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
		if (bullet) {
			flushParagraph();
			flushTable();
			blocks.push({ type: "bulleted_list", content: stripInline(bullet[1]) });
			continue;
		}
		const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
		if (numbered) {
			flushParagraph();
			flushTable();
			blocks.push({ type: "numbered_list", content: stripInline(numbered[1]) });
			continue;
		}
		const quote = /^>\s?(.*)$/.exec(trimmed);
		if (quote) {
			flushParagraph();
			flushTable();
			blocks.push({ type: "quote", content: stripInline(quote[1]) });
			continue;
		}
		// A wrapped list item: an indented continuation belongs to the item above.
		const previous = blocks[blocks.length - 1];
		if (!paragraph.length && previous && LIST_TYPES.has(previous.type) && /^\s/.test(line)) {
			previous.content = `${previous.content} ${stripInline(trimmed)}`;
			continue;
		}
		paragraph.push(trimmed);
	}
	flushParagraph();
	flushTable();
	if (code) blocks.push({ type: "code", content: code.lines.join("\n"), language: code.language });

	return { blocks, markers };
}

/** The corpus: one entry per markdown file, sorted by slug. */
export function readCorpus() {
	const pages = [];
	for (const file of readdirSync(CORPUS_DIR).sort()) {
		if (!file.endsWith(".md")) continue;
		const slug = file.slice(0, -3);
		const raw = readFileSync(path.join(CORPUS_DIR, file), "utf8");
		const { meta, body } = parseFrontMatter(raw);
		const { blocks, markers } = parseBlocks(body);
		pages.push({
			slug,
			file,
			meta,
			blocks,
			markers,
			raw,
			archived: meta.archived === true || meta.archived === "true",
			text: blocks.map((block) => block.content).join("\n"),
		});
	}
	return pages;
}

/** The questions, one object per line. */
export function readGolden() {
	const raw = readFileSync(GOLDEN_PATH, "utf8");
	return raw
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line, index) => {
			let parsed;
			try {
				parsed = JSON.parse(line);
			} catch (error) {
				throw new Error(`golden.jsonl line ${index + 1} is not JSON: ${error.message}`);
			}
			return parsed;
		});
}
