import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	bestThreshold,
	bootstrapCi,
	bootstrapIndices,
	classification,
	mean,
	meanWithCi,
	ndcgAt,
	pairedDifference,
	percentile,
	rankOf,
	recallAt,
	reciprocalRankAt,
	splitHalves,
} from "./rag-stats.mjs";

describe("ranking metrics", () => {
	it("score one relevant page by its rank", () => {
		assert.equal(rankOf(["a", "b", "c"], "c"), 3);
		assert.equal(rankOf(["a"], "z"), 0);
		assert.equal(recallAt(5, 5), 1);
		assert.equal(recallAt(6, 5), 0);
		assert.equal(recallAt(0, 5), 0);
		assert.equal(reciprocalRankAt(4, 10), 0.25);
		assert.equal(reciprocalRankAt(11, 10), 0);
		assert.equal(ndcgAt(1, 10), 1);
		assert.ok(Math.abs(ndcgAt(3, 10) - 0.5) < 1e-12, "1 / log2(4) is 0.5");
	});
});

describe("bootstrap", () => {
	const values = Array.from({ length: 100 }, (_, index) => (index % 4 === 0 ? 1 : 0));
	const indices = bootstrapIndices(values.length);

	it("is the same on every run (seed 42) and brackets the mean", () => {
		assert.deepEqual(bootstrapIndices(values.length)[7], indices[7]);
		const { low, high } = bootstrapCi(values, indices);
		assert.ok(low < mean(values) && mean(values) < high, `${low} < ${mean(values)} < ${high}`);
	});

	it("puts a paired difference above zero only when every question gains", () => {
		const before = values.map(() => 0);
		const after = values.map(() => 1);
		assert.ok(pairedDifference(before, after, indices).low > 0);
		assert.ok(pairedDifference(values, values, indices).high === 0);
	});

	it("takes percentiles by nearest rank", () => {
		assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
		assert.equal(percentile([], 0.5), 0);
	});
});

describe("abstention", () => {
	it("computes precision, recall and F1 of the positives", () => {
		const items = [
			{ positive: true, predicted: true },
			{ positive: true, predicted: false },
			{ positive: false, predicted: true },
			{ positive: false, predicted: false },
		];
		assert.deepEqual(classification(items), { precision: 0.5, recall: 0.5, f1: 0.5 });
	});

	it("keeps 80 answerable and 20 unanswerable questions in each half of 160 + 40", () => {
		const items = Array.from({ length: 200 }, (_, index) => ({ id: index, positive: index >= 160, score: index / 200 }));
		const { calibration, test } = splitHalves(items);
		for (const half of [calibration, test]) {
			assert.equal(half.filter((item) => !item.positive).length, 80);
			assert.equal(half.filter((item) => item.positive).length, 20);
		}
		assert.equal(new Set([...calibration, ...test].map((item) => item.id)).size, 200);
	});

	it("finds the cut that separates two clean groups, and the lowest one on a tie", () => {
		const items = [
			...[0.1, 0.2, 0.3].map((score) => ({ positive: true, score })),
			...[0.7, 0.8, 0.9].map((score) => ({ positive: false, score })),
		];
		const { threshold, f1 } = bestThreshold(items);
		assert.equal(f1, 1);
		assert.ok(Math.abs(threshold - 0.5) < 1e-9, `the midpoint between 0.3 and 0.7, got ${threshold}`);
	});
});


describe("meanWithCi", () => {
	it("wraps the mean with a bootstrap interval", () => {
		const values = [0, 1, 0, 1];
		const indices = bootstrapIndices(values.length);
		const result = meanWithCi(values, indices);
		assert.equal(result.value, 0.5);
		assert.ok(result.low <= result.value && result.value <= result.high);
	});
});
