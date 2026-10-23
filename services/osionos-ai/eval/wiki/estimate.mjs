/* ************************************************************************** */
/*                                                                            */
/*   estimate.mjs                  the chunks of the import, without embedding */
/*                                                                            */
/*   Runs the indexer's own chunker (src/indexer/chunker.ts) on the pages the */
/*   importer would write, for every k-th accepted article of the JSONL: a    */
/*   systematic sample across the whole file, where the measured 500 come     */
/*   from its head. Prints the chunks per article and, with --every 1, the    */
/*   exact N of a head-of-file import (--limit N) that reaches the target.    */
/*                                                                            */
/*   Caveat: a systematic sample is biased if the file has a period near k;   */
/*   the file is in page-id order, which has none we know of.                 */
/*                                                                            */
/*   No dependencies. Node 22 (type stripping for the .ts import).            */
/*                                                                            */
/*   usage:                                                                 */
/*     node estimate.mjs [--jsonl F] [--every K] [--limit N] [--target C]   */
/* ************************************************************************** */

import process from "node:process";
import { pathToFileURL } from "node:url";
import { chunkPage } from "../../src/indexer/chunker.ts";
import { readArticles } from "./import.mjs";
import { blocksOf, skipReason } from "./pages.mjs";

/** The chunks the indexer cuts from the page of an article. */
export function chunksOf(article) {
	return chunkPage({ title: article.title, content: blocksOf(article) }).length;
}

/**
 * The estimate: every k-th accepted article, up to limit accepted (0 = all).
 * With every = 1, reachedAt is the number of head articles whose chunks reach
 * the target (0 if they never do).
 */
export async function estimate(articles, { every = 1, limit = 0, target = 0 } = {}) {
	let accepted = 0;
	let sampled = 0;
	let chunks = 0;
	let reachedAt = 0;
	for await (const article of articles) {
		if (skipReason(article) !== null) continue;
		if (accepted % every === 0) {
			sampled += 1;
			chunks += chunksOf(article);
		}
		accepted += 1;
		if (every === 1 && reachedAt === 0 && target > 0 && chunks >= target) reachedAt = accepted;
		if (limit > 0 && accepted >= limit) break;
	}
	return { accepted, sampled, chunks, reachedAt, perArticle: sampled > 0 ? chunks / sampled : 0 };
}

function parseArgs(argv) {
	const options = { jsonl: "/data/articles.jsonl", every: 1, limit: 0, target: 110000 };
	for (let index = 0; index < argv.length; index += 2) {
		const [flag, value] = [argv[index], argv[index + 1]];
		if (flag === "--jsonl") options.jsonl = value;
		else if (["--every", "--limit", "--target"].includes(flag)) options[flag.slice(2)] = Number(value);
		else throw new Error(`unknown argument: ${flag}`);
	}
	return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const options = parseArgs(process.argv.slice(2));
	const result = await estimate(readArticles(options.jsonl), options);
	const perArticle = result.perArticle.toFixed(3);
	const needed = Math.ceil(options.target / result.perArticle);
	process.stdout.write(
		`accepted=${result.accepted} sampled=${result.sampled} chunks=${result.chunks} ` +
			`chunks/article=${perArticle} projected-chunks=${Math.round(result.accepted * result.perArticle)} ` +
			`articles-for-${options.target}=${needed} head-articles-for-${options.target}=${result.reachedAt}\n`,
	);
}
