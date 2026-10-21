/* ************************************************************************** */
/*                                                                            */
/*   import.mjs                      the Wikipedia importer                    */
/*                                                                            */
/*   Reads the articles.jsonl of the volume and writes the pages of one       */
/*   workspace: one row of osionos_pages per article, with the blocks the     */
/*   indexer cuts into chunks. Chunking and embedding are the indexer's job   */
/*   (src/indexer/chunker.ts), never this file's.                             */
/*                                                                            */
/*   The import is a bulk job. Every batch runs in its own transaction, and   */
/*   the queue rows of the batch are moved to the bulk lane (1) in the SAME   */
/*   transaction: the worker cannot claim a row that is not committed, and a  */
/*   person who edits a page never waits behind a whole import.              */
/*                                                                            */
/*   The ids are uuid v5 values, so a re-run writes the same rows.            */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/*                                                                            */
/*   usage:                                                                 */
/*     node import.mjs --workspace-owner <uuid> [--limit N] [--from <title>] */
/*     node import.mjs --workspace-owner <uuid> --database-url <url>         */
/* ************************************************************************** */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import process from "node:process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
	BATCH_PAGES,
	BULK_LANE,
	MIN_ARTICLE_CHARS,
	VISIBILITY,
	WORKSPACE_ID,
	WORKSPACE_NAME,
	WORKSPACE_SLUG,
	blocksOf,
	jsonb,
	pageId,
	quote,
	skipReason,
} from "./pages.mjs";

export { BATCH_PAGES, BULK_LANE, MIN_ARTICLE_CHARS, VISIBILITY, WORKSPACE_ID };

/** The row of a page: the columns of the fixture and of the migration. */
function pageValues(article, options) {
	return [
		quote(pageId(article.title)),
		quote(options.workspaceId),
		"NULL",
		quote(options.ownerId),
		quote(article.title),
		quote("icon:file-text"),
		"NULL",
		quote("page"),
		quote(options.visibility),
		jsonb([]),
		jsonb([]),
		jsonb(blocksOf(article)),
		"NULL",
		quote(options.createdAt),
		"now()",
	];
}

/** The INSERT of a page: the same shape as eval/seed.mjs. */
function pageSql(article, options) {
	return [
		"INSERT INTO public.osionos_pages (id, workspace_id, parent_page_id, owner_id, title, icon, database_id, surface, visibility, collaborators, properties, content, archived_at, created_at, updated_at)",
		`VALUES (${pageValues(article, options).join(", ")})`,
		"ON CONFLICT (id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id, parent_page_id=EXCLUDED.parent_page_id, owner_id=EXCLUDED.owner_id, title=EXCLUDED.title, icon=EXCLUDED.icon, database_id=EXCLUDED.database_id, surface=EXCLUDED.surface, visibility=EXCLUDED.visibility, collaborators=EXCLUDED.collaborators, properties=EXCLUDED.properties, content=EXCLUDED.content, archived_at=EXCLUDED.archived_at, updated_at=now();",
	].join("\n");
}

/** The workspace of the import and its owner: written once, idempotently. */
export function workspaceSql(options) {
	return [
		"INSERT INTO public.osionos_workspaces (id, owner_id, name, slug)",
		`VALUES (${quote(options.workspaceId)}, ${quote(options.ownerId)}, ${quote(options.workspaceName)}, ${quote(options.workspaceSlug)})`,
		"ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id, name=EXCLUDED.name;",
		"INSERT INTO public.osionos_workspace_members (workspace_id, user_id, role, permissions)",
		`VALUES (${quote(options.workspaceId)}, ${quote(options.ownerId)}, 'owner', ARRAY['read'])`,
		"ON CONFLICT (workspace_id, user_id) DO UPDATE SET role=EXCLUDED.role, permissions=EXCLUDED.permissions;",
	].join("\n");
}

/**
 * The SQL of one batch: the pages, and the move of their queue rows to the
 * bulk lane.
 *
 * The UPDATE is in the SAME transaction as the inserts: the worker claims the
 * rows with FOR UPDATE SKIP LOCKED, and it can only claim a committed row.
 * Without the UPDATE the rows would stay in lane 0 (an edit of a person) and
 * every real edit of the workspace would wait behind the import.
 */
export function batchSql(articles, options) {
	const ids = articles.map((article) => quote(pageId(article.title)));
	const lines = ["BEGIN;", "SET LOCAL standard_conforming_strings = on;"];
	for (const article of articles) lines.push(pageSql(article, options));
	lines.push(
		`UPDATE public.ai_index_queue SET priority = ${options.bulkLane} WHERE page_id = ANY(ARRAY[${ids.join(", ")}]::uuid[]);`,
	);
	lines.push("COMMIT;");
	return lines.join("\n");
}

/** The psql of a throwaway Postgres: the url names the container. */
export function psqlCommand(databaseUrl) {
	let url;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error("the database url is not a url");
	}
	const container = url.hostname;
	const user = decodeURIComponent(url.username || "postgres");
	const password = decodeURIComponent(url.password || "");
	const database = url.pathname.replace(/^\//, "") || "osionos_ai_test";
	const args = ["exec", "-i"];
	if (password.length > 0) args.push("-e", `PGPASSWORD=${password}`);
	args.push(container, "psql", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database);
	return args;
}

/** The arguments of the importer. */
export function parseArgs(argv) {
	const options = {
		ownerId: "",
		limit: 0,
		from: "",
		jsonl: "/data/articles.jsonl",
		batch: BATCH_PAGES,
		workspaceId: WORKSPACE_ID,
		workspaceName: WORKSPACE_NAME,
		workspaceSlug: WORKSPACE_SLUG,
		visibility: VISIBILITY,
		bulkLane: BULK_LANE,
		createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
		databaseUrl: "",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const value = argv[index + 1];
		switch (argument) {
			case "--workspace-owner":
				options.ownerId = value ?? "";
				index += 1;
				break;
			case "--limit":
				options.limit = Number(value ?? 0);
				index += 1;
				break;
			case "--from":
				options.from = value ?? "";
				index += 1;
				break;
			case "--jsonl":
				options.jsonl = value ?? "";
				index += 1;
				break;
			case "--batch":
				options.batch = Number(value ?? BATCH_PAGES);
				index += 1;
				break;
			case "--workspace-id":
				options.workspaceId = value ?? "";
				index += 1;
				break;
			case "--database-url":
				options.databaseUrl = value ?? "";
				index += 1;
				break;
			default:
				throw new Error(`unknown argument: ${argument}`);
		}
	}
	return options;
}

/** The articles of the file, one by one: the file is never in memory. */
export async function* readArticles(path) {
	const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of lines) {
		if (line.trim().length === 0) continue;
		yield JSON.parse(line);
	}
}

/** The run: the batches, one transaction each. */
export async function run(options, write) {
	const reasons = { redirect: 0, disambiguation: 0, stub: 0, "no-title": 0 };
	let imported = 0;
	let accepted = 0;
	let skipped = 0;
	let seen = 0;
	let started = options.from.length > 0;
	let batch = [];
	const flush = async () => {
		if (batch.length === 0) return;
		await write(batchSql(batch, options));
		imported += batch.length;
		batch = [];
	};
	for await (const article of readArticles(options.jsonl)) {
		seen += 1;
		if (!started) {
			if (article.title === options.from) started = true;
			else continue;
		}
		const reason = skipReason(article);
		if (reason !== null) {
			skipped += 1;
			reasons[reason] = (reasons[reason] ?? 0) + 1;
			continue;
		}
		batch.push(article);
		accepted += 1;
		if (batch.length >= options.batch) {
			await flush();
			process.stderr.write(
				`[import] ${imported} articles imported, ${skipped} skipped, ${seen} read\n`,
			);
		}
		if (options.limit > 0 && accepted >= options.limit) break;
	}
	await flush();
	return { imported, accepted, skipped, seen, reasons };
}

/** The main: the SQL on stdout, or the psql of a throwaway Postgres. */
export async function main(argv) {
	const options = parseArgs(argv);
	if (options.ownerId.length === 0) {
		process.stderr.write("[import] --workspace-owner <uuid> is needed\n");
		return 2;
	}
	if (options.limit > 0 && options.from.length > 0) {
		process.stderr.write("[import] --limit and --from together are ambiguous\n");
		return 2;
	}
	const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || "";
	const command = databaseUrl.length > 0 ? psqlCommand(databaseUrl) : null;
	if (command === null) {
		// The SQL on stdout: the caller pipes it into psql.
		await write(workspaceSql(options));
		const result = await run(options, async (sql) => {
			process.stdout.write(sql);
			process.stdout.write("\n");
		});
		process.stderr.write(`[import] ${result.imported} articles, ${result.skipped} skipped\n`);
		return 0;
	}
	const psql = spawn("docker", command, { stdio: ["pipe", "inherit", "inherit"] });
	const write = async (sql) => {
		await new Promise((resolve, reject) => {
			psql.stdin.write(`${sql}\n`, (error) => (error ? reject(error) : resolve()));
		});
	};
	try {
		await write(workspaceSql(options));
		const result = await run(options, write);
		await new Promise((resolve) => psql.stdin.end(resolve));
		const code = await new Promise((resolve) => psql.on("close", resolve));
		if (code !== 0) return 1;
		process.stderr.write(
			`[import] ${result.imported} articles imported, ${result.skipped} skipped, ${result.seen} read\n`,
		);
		return 0;
	} catch (error) {
		psql.stdin.end();
		process.stderr.write(`[import] failed: ${error.message}\n`);
		return 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
