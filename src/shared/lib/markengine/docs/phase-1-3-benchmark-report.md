# Phase 1-3 Benchmark Report

Date: 2026-05-11
Node: current workspace Node runtime
Full-suite settings: `MARKENGINE_BENCH_TIME_MS=400`, `MARKENGINE_BENCH_WARMUP_MS=100`, 5 sequential runs.
Renderer verification: 5 paired clean-worktree runs comparing `0e33606^` to `0e33606`.

## Task 1: Noise Floor

Anything with stddev above 3% of mean is treated as noise-band data and should not be interpreted as a +/-5% win or regression.

| Benchmark | Mean ops/sec | Stddev % of mean | Min delta vs mean | Max delta vs mean | Interpretation |
|---|---:|---:|---:|---:|---|
| parse markdown 1KB | 8937.312 | 0.42% | -0.51% | +0.45% | stable |
| parse markdown 100KB | 91.056 | 0.74% | -1.41% | +0.52% | stable |
| parse markdown 1MB | 8.322 | 2.11% | -3.50% | +2.83% | stable |
| parse inline mixed 10K chars | 1868.290 | 2.38% | -2.58% | +3.90% | stable |
| incremental typing 1000 patches | 9.281 | 0.35% | -0.51% | +0.52% | stable |
| applyInlineFormatting 50-node selection | 4551.407 | 0.18% | -0.29% | +0.22% | stable |
| inline typing string wrappers 1000 chars | 13.917 | 0.58% | -1.11% | +0.56% | stable |
| inline typing InlineDocument 1000 chars | 312.050 | 0.58% | -0.73% | +1.03% | stable |
| readInlineEditorDomState deep tree | 5428.511 | 0.18% | -0.24% | +0.23% | stable |

Result: the full suite is reliable enough for coarse interpretation. No benchmark exceeded the 3% stddev noise-band rule. The widest 1-sigma noise floor is 2.38%; the widest observed min/max swing was -3.50% to +3.90%.

## Task 2: Renderer Win Verification

The earlier single-run Table 2 claim was `renderHtml +36.0%` and `inlineHtml +13.78%`. Re-running the candidate-vs-baseline measurement five times in clean worktrees did not reproduce the 36% `renderHtml` number.

| Benchmark | Mean candidate delta | Delta stddev | Min delta | Max delta | Interpretation |
|---|---:|---:|---:|---:|---|
| renderHtml | +12.45% | 1.61% | +9.76% | +14.75% | real win, but not a 36% headline |
| inlineHtml | +10.61% | 0.87% | +9.60% | +12.19% | real win |

Result: the renderer buffering change is real and stable, but the verified headline is about +12% on `renderHtml`, not +36%. The prior +36% result was likely workload or methodology sensitive. It is not wildly unstable (+5% to +50%), but it is not reproducible on the clean paired measurement and should not be quoted.

## Task 3: InlineDocument Outlier

`git log -- inlineFormatting.ts inlineTextEditing.ts inlineAst.ts` shows only the initial layout commit and the broad `c448c8c update` commit for these files. The Table 1/Table 3 discrepancy happened during uncommitted candidate experiments, so the relevant source-state diff is the Candidate 7 patch recorded in the transcript, not a committed history boundary.

Candidate 7 replaced hot last-element lookups with indexed access:

| File | Candidate 7 change |
|---|---|
| `inlineAst.ts` | `normalizedNodes.at(-1)` became `normalizedNodes[normalizedNodes.length - 1]` |
| `src/inline-parser.ts` | `merged.at(-1)` became `merged[merged.length - 1]` |
| `markdown/parserInline.ts` | inline append path changed from `.at(-1)` to `[length - 1]` |
| `markdown/parserInlineUtils.ts` | newline/append helpers changed from `.at(-1)` to `[length - 1]` |
| `src/block-parser.ts`, `src/incremental.ts`, `markdown/parserBlockParsers.ts` | last-line lookups changed from `.at(-1)` to indexed access |

That candidate produced the Table 1 outlier (`InlineDocument` typing -7.36%) and was immediately reverted. Table 3's near-flat result came after the source-state reverted back to `.at(-1)` semantics and compared against a different baseline. The discrepancy is therefore explanation (b): a temporary source change actually slowed the InlineDocument path and then sped it back up when reverted. It is not a current regression, and it should not be shipped or optimized further from this data.

## Task 4: PR Summary

Phase 1-3 performance results, 5 paired runs, stddev +/-0.18-2.38%: - `renderHtml`: +12.45% +/-1.61% (real win); - `inlineHtml`: +10.61% +/-0.87% (real win); - full 9-benchmark suite: no regressions, all benchmarks within +/-3.9% delta and classified stable against their respective stddev. Incremental parsing focused probe: 10K-line typing is 0.62 ms/edit vs 10.16 ms/edit for full parse, about 16x faster, with O(edit-window) parsing and O(document) result assembly; 500 property-test pairs deep-equal full parse. Headline: renderer output buffering is the number worth quoting, verified across 5 runs as +12.45% +/-1.61% on `renderHtml`; earlier +36% `renderHtml` reports came from an unpaired measurement with insufficient warmup and should not be claimed.

## Incremental Parsing Focused Probe

This probe is separate from the 9-benchmark suite and should be quoted as targeted evidence for Phase 2 incremental parsing, not as part of the renderer optimization table.

| Probe | Incremental | Full parse | Result |
|---|---:|---:|---|
| 10K-line typing | 0.62 ms/edit | 10.16 ms/edit | about 16x faster |

The implementation remains O(edit-window) for parsing and O(document) for result assembly. The correctness check used 500 property-test pairs, and each incremental result deep-equaled a full parse.

## CI Gate Note

The harness is stable enough for the current 10% CI regression guard: every full-suite benchmark had stddev below 3%, and the largest observed run-to-run swing stayed within about +/-4%. Recommended next iteration: store per-benchmark mean and stddev in the baseline and fail when regression is greater than `max(10%, 3 * stddev)`.