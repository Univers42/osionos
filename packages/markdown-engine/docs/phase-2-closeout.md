# Phase 2 Closeout: Incremental Parser Residual Cost

## Measurements

| Lines | incremental ms/edit | ms/edit per 1K lines |
| ---: | ---: | ---: |
| 1,000 | 0.0791 | 0.07908 |
| 5,000 | 0.3552 | 0.07104 |
| 10,000 | 0.7014 | 0.07014 |
| 50,000 | 4.0953 | 0.08191 |
| 200,000 | 17.4669 | 0.08733 |

## 50K Bucket Breakdown

| Bucket | ms | % |
| --- | ---: | ---: |
| Patch application + line splitting | 4.2712 | 68.27 |
| Building blockIndex | 0.6148 | 9.83 |
| Building children array | 0.6083 | 9.72 |
| Boundary search | 0.2463 | 3.94 |
| Cache lookups | 0.0541 | 0.86 |
| Reparse affected window | 0.0222 | 0.35 |
| Span/id shifting downstream | 0.0118 | 0.19 |
| Diagnostics merging | 0.0461 | 0.74 |
| Other / timer overhead | 0.3815 | 6.10 |

## Classification

| Bucket >=5% | Classification | Notes |
| --- | --- | --- |
| Patch application + line splitting | ESSENTIAL | Whole-string input/output requires reconstructing and splitting document text. |
| Building blockIndex | AVOIDABLE-CHEAP | Lazy construction could remove most cost, but measured under the 10% threshold. |
| Building children array | AVOIDABLE-CHEAP | Structural sharing could reduce copies, but not enough to justify Phase 2 scope. |

## Chosen Option

Option A - Accept and document.

The residual is linear and not mischaracterized, but the earlier explanation was incomplete: at 50K lines, patch application and line splitting dominate more than AST handoff. Parsing work is truly bounded to the edit window; result/text assembly remains O(document) because the public contract returns a full string, full AST, and full block index. The measured constant is small and predictable through 200K lines. Buckets targeted by Options B and C are each under their decision threshold, and Option D is not justified without a latency target miss or user complaint.

Phase 2 changelog sentence: `incrementalParse: O(edit-window) parsing, O(document) text/result assembly, ~16x faster typing at 10K lines.`
