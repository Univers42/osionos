# Labelling guide

## How to fill one line (under a minute)

1. Read the `answer` and the `sources` already filled by a live run.
2. Set `human.faithful`: `true` if every factual claim in the answer is
   supported by a quoted source; an abstention ("not found in your
   workspace") is faithful.
3. Set `human.relevant`: 1–5, how well the answer addresses the question.
4. Save. The `judge` field holds the judge's verdict for comparison.

## Fields

- `id`: the question id.
- `answer`: the model's answer (filled by the run).
- `sources`: the quoted sources (filled by the run).
- `judge`: `{faithful, relevant, abstained}` from the LLM judge.
- `human`: `{faithful, relevant}` your label.

## Worked examples

**Example 1 (answerable).** Question: "What is the lead time for the NW-LARK-77
frame kit?" Answer: "Eight weeks from the Vejle workshop." Sources quote the
Lark spec page. → faithful: true, relevant: 5.

**Example 2 (unanswerable).** Question: "What is the delivery lead time for the
NW-KITE-33 shelf system?" Answer: "Not found in your workspace." → faithful:
true (abstention is faithful), relevant: 1.