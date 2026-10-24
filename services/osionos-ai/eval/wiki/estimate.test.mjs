/* ************************************************************************** */
/*                                                                            */
/*   estimate.test.mjs                  the tests of the chunk estimate       */
/*                                                                            */
/*   The estimate counts what the indexer's chunker cuts, skips what the      */
/*   importer skips, samples every k-th article, and finds the head prefix   */
/*   that reaches a target.                                                   */
/*                                                                            */
/*   No dependencies of its own. Node 22.                                    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { article, longArticle } from "./cases.mjs";
import { chunksOf, estimate } from "./estimate.mjs";

async function* stream(articles) {
	yield* articles;
}

describe("the chunk estimate of the import", () => {
	const long = ["Alpha", "Beta", "Gamma", "Delta"].map(longArticle);
	const articles = [long[0], article("Stub"), long[1], long[2], long[3]];
	const perPage = long.map(chunksOf);

	it("counts the chunks of the accepted articles and skips the stubs", async () => {
		const result = await estimate(stream(articles));
		assert.equal(result.accepted, 4);
		assert.equal(result.chunks, perPage.reduce((sum, value) => sum + value, 0));
	});

	it("samples every k-th accepted article", async () => {
		const result = await estimate(stream(articles), { every: 2 });
		assert.equal(result.sampled, 2);
		assert.equal(result.chunks, perPage[0] + perPage[2]);
	});

	it("finds the head prefix whose chunks reach the target", async () => {
		const target = perPage[0] + perPage[1];
		const result = await estimate(stream(articles), { target });
		assert.equal(result.reachedAt, 2);
		const never = await estimate(stream(articles), { target: 10_000 });
		assert.equal(never.reachedAt, 0);
	});
});
