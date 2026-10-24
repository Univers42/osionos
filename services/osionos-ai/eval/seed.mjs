/* ************************************************************************** */
/*                                                                            */
/*   seed.mjs                                           the seed generator     */
/*                                                                            */
/*   Reads eval/corpus/*.md and writes idempotent SQL for osionos_pages on   */
/*   stdout. One INSERT per page, ON CONFLICT (id) DO UPDATE, so the file    */
/*   can be applied twice. Ids are uuid v5 values derived from the slug, the  */
/*   workspace name and the user key, so a re-run produces the same rows.     */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/*                                                                            */
/*   Apply with:                                                             */
/*     node services/osionos-ai/eval/seed.mjs | psql $DATABASE_URL           */
/* ************************************************************************** */

import process from "node:process";
import {
	USER_IDS,
	WORKSPACE_ID,
	pageId,
	readCorpus,
	readGolden,
} from "./lib.mjs";

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
// A jsonb literal. The corpus never contains the dollar-quote tag, so the
// payload cannot close the literal early.
const jb = (value) => `$j$${JSON.stringify(value)}$j$::jsonb`;

const CREATED_AT = "2026-01-05T09:00:00Z";

function blocksToJson(blocks) {
	return blocks.map((block, index) => {
		const stored = { id: `b${index + 1}`, type: block.type, content: block.content };
		if (block.type === "table_block") stored.tableData = block.tableData;
		if (block.type === "code") stored.language = block.language;
		if (block.type === "to_do") stored.checked = block.checked;
		return stored;
	});
}

function countBy(items, key) {
	const counts = {};
	for (const item of items) {
		const value = item[key];
		counts[value] = (counts[value] ?? 0) + 1;
	}
	return counts;
}

function formatCounts(counts) {
	return Object.keys(counts)
		.sort()
		.map((key) => `${key}:${counts[key]}`)
		.join(",");
}

const pages = readCorpus();

let questions = [];
try {
	questions = readGolden();
} catch {
	questions = [];
}

const blocks = pages.reduce((total, page) => total + page.blocks.length, 0);
const languages = countBy(questions, "lang");
const kinds = countBy(questions, "kind");

const lines = [];
lines.push("-- Northwind Atelier golden corpus -- a synthetic workspace for the retrieval golden set.");
lines.push(`-- pages=${pages.length} blocks=${blocks} questions=${questions.length} kinds=${formatCounts(kinds)} langs=${formatCounts(languages)}`);
lines.push(`-- workspace=${WORKSPACE_ID} users=${Object.entries(USER_IDS).map(([key, id]) => `${key}=${id}`).join(",")}`);
lines.push("-- Caveat: synthetic text written by a model; recall on it is a regression gate, not a quality claim about real workspaces.");
lines.push("BEGIN;");

for (const page of pages) {
	const collaborators = (page.meta.collaborators ?? []).map((entry) => ({
		userId: USER_IDS[entry.user],
		role: entry.role,
	}));
	const values = [
		q(pageId(page.slug)),
		q(WORKSPACE_ID),
		"NULL",
		q(USER_IDS[page.meta.owner]),
		q(page.meta.title),
		q("icon:file-text"),
		"NULL",
		q("page"),
		q(page.meta.visibility),
		jb(collaborators),
		jb([]),
		jb(blocksToJson(page.blocks)),
		page.archived ? q(`${CREATED_AT}`) : "NULL",
		q(CREATED_AT),
		"now()",
	];
	lines.push(
		`INSERT INTO public.osionos_pages (id, workspace_id, parent_page_id, owner_id, title, icon, database_id, surface, visibility, collaborators, properties, content, archived_at, created_at, updated_at)`,
	);
	lines.push(`VALUES (${values.join(", ")})`);
	lines.push(
		`ON CONFLICT (id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id, parent_page_id=EXCLUDED.parent_page_id, owner_id=EXCLUDED.owner_id, title=EXCLUDED.title, icon=EXCLUDED.icon, database_id=EXCLUDED.database_id, surface=EXCLUDED.surface, visibility=EXCLUDED.visibility, collaborators=EXCLUDED.collaborators, properties=EXCLUDED.properties, content=EXCLUDED.content, archived_at=EXCLUDED.archived_at, updated_at=now();`,
	);
}

lines.push("COMMIT;");

// A reader that closes the pipe early (head, less) is not an error here.
process.stdout.on("error", (error) => {
	if (error.code === "EPIPE") process.exit(0);
	throw error;
});

process.stdout.write(`${lines.join("\n")}\n`);
