/* ************************************************************************** */
/*                                                                            */
/*   seed-ten.mjs                      the seed of the indexer measurement    */
/*                                                                            */
/*   The corpus of the golden set, ten times over, in ten workspaces: about  */
/*   2 800 chunks to index. The pages are written BEFORE the RAG migration,   */
/*   so the backfill of the migration queues them — as bulk work, lane 1.    */
/*                                                                            */
/*   The page ids are derived from the workspace and the slug, so the ten    */
/*   workspaces hold ten different pages (the queue has one row per page).   */
/*                                                                            */
/*   No dependencies. Node 22.                                              */
/* ************************************************************************** */

import process from "node:process";
import { USER_IDS, readCorpus, uuid5 } from "../../eval/lib.mjs";

const WORKSPACES = Number(process.env.AI_IDX_WORKSPACES ?? 10);

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

const pages = readCorpus();
const lines = [];
lines.push(`-- the corpus of the golden set, ${WORKSPACES} times over: the backfill of the measurement.`);
lines.push(`-- pages=${pages.length * WORKSPACES} blocks=${pages.length * WORKSPACES}`);
lines.push("BEGIN;");

for (let index = 0; index < WORKSPACES; index += 1) {
	const workspaceId = uuid5(`workspace:northwind-atelier:${index}`);
	for (const page of pages) {
		const collaborators = (page.meta.collaborators ?? []).map((entry) => ({
			userId: USER_IDS[entry.user],
			role: entry.role,
		}));
		const values = [
			q(uuid5(`page:${index}:${page.slug}`)),
			q(workspaceId),
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
			page.archived ? q(CREATED_AT) : "NULL",
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
}

lines.push("COMMIT;");

process.stdout.on("error", (error) => {
	if (error.code === "EPIPE") process.exit(0);
	throw error;
});

process.stdout.write(`${lines.join("\n")}\n`);
