# The golden set, measured — hybrid retrieval with the real embedder

- Date: 2026-10-21T11:13:31Z
- Commit: `65e96cf2338ef17c365659b0e0122c3e58ccce23`
- Command: `sh services/osionos-ai/eval/run.sh /tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-ai/models/osionos-ai-migration.sql /tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-ai/models/osionos-ai-rag-migration.sql`
- Images: `pgvector/pgvector:0.8.0-pg16`, `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4` (model `intfloat/multilingual-e5-small`), `node:22-bookworm-slim`
- Mode: the asker of the question retrieves, and the asker of the question scores

## The index

- Pages indexed: 40 (the two archived pages are dropped by the indexer)
- Chunks in the index: 278, of which 278 carry a vector
- Indexing time: 15.5 s (the indexer's own 10 s debounce included; 5.1 s of page work)
- The index in the database: 2.34 MB; 54.2 chunks embedded per second

## The results

`scored` is the number of questions with a non-empty `expected`: the negative and the refused acl
questions have none, and they are counted in `n` only.

| kind | n | scored | recall@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| lexical | 12 | 12 | 1.00 | 1.000 |
| paraphrase | 14 | 14 | 0.86 | 0.595 |
| multi | 8 | 8 | 0.94 | 1.000 |
| fr | 10 | 10 | 0.75 | 0.800 |
| xl | 14 | 14 | 0.43 | 0.345 |
| negative | 4 | 0 | — | — |
| acl | 6 | 2 | 1.00 | 1.000 |

- Overall: n=68, scored=60, recall@5=0.78, MRR@5=0.719
- Leaks: 0 (none)
- Questions no retrieval can answer (the asker may not read the page): q35 (u_chloe → deal-northlake-hotels)
- Latency of retrieve(): p50 10 ms, p95 12 ms (the embedding included)

## The negative questions

The top fused score of a question nothing answers. A threshold that separates them from the
answered ones would have to sit between the numbers below and the lowest score of an answered
question; no threshold is added here.

| id | question | top score | top page |
| --- | --- | --- | --- |
| q41 | What is the delivery lead time for the Kestrel teak outdoor line? | 0.01639 | Standard contract terms |
| q42 | Who signs off discounts above fifty thousand on the Orenda programme? | 0.01639 | Discount ladder and pricing rules |
| q43 | How does the Tessin assembly cell recover after a spindle jam? | 0.01639 | Spec — Lark task chair |
| q44 | What is the escalation path for a Bramble line warranty claim? | 0.01639 | Runbook — warranty claims and service visits |

- The lowest top score of a question that found its page: 0.01639 (q01).
- The highest top score of a negative question: 0.01639. A threshold between the two would NOT separate them in this run.
- Caveat: the fused score is a reciprocal rank, not a magnitude. A chunk that is first in ONE of the
  two lists scores 1/61 ≈ 0.01639 whatever the question is, so the gap above is a property of
  this run, not a property of the questions.

## The five worst misses

| id | kind | question | expected | returned |
| --- | --- | --- | --- | --- |
| q18 | paraphrase | What actually limits what we can promise to a client? | sales-playbook-overview (Sales playbook — Northwind Atelier) | hr-code-of-conduct (Code of conduct), deal-lumen-hotels (Deal — Lumen Hotels (40 rooms)), runbook-ordering-spares (Runbook — ordering spare parts), meeting-sales-kickoff-q1 (Meeting — sales kick-off, first quarter 2026), deal-pricing-discounts (Discount ladder and pricing rules) |
| q21 | paraphrase | After how long does an entry disappear from the forecast? | meeting-sales-kickoff-q1 (Meeting — sales kick-off, first quarter 2026) | sales-playbook-overview (Sales playbook — Northwind Atelier), deal-forecast-q3 (Pipeline forecast — third quarter 2026), meeting-client-review-northlake (Meeting — client review with Northlake Hotels Group), runbook-node-provisioning (Runbook — node provisioning for new sites) |
| q35 | fr | Quelle valeur commerciale a été arrêtée avec le groupe hôtelier, et pour combien de chambres ? | deal-northlake-hotels (Deal — Northlake Hotels Group (84 rooms)) | reunion-presentation-fr (Réunion de présentation — programme Nordhavn), deal-lumen-hotels (Deal — Lumen Hotels (40 rooms)), playbook-commercial-fr (Playbook commercial — marché francophone), deal-competitive-pricing (Competitive pricing — what the market pays) |
| q36 | fr | Quels justificatifs faut-il joindre pour faire ouvrir un dossier de garantie ? | runbook-warranty-claims (Runbook — warranty claims and service visits) | playbook-commercial-fr (Playbook commercial — marché francophone), entretien-flotte-fr (Entretien de la flotte de livraison), cahier-des-charges-rive-nord-fr (Cahier des charges — système d'étagères Rive Nord), reunion-presentation-fr (Réunion de présentation — programme Nordhavn) |
| q51 | xl | Combien de semaines prend une fabrication sur mesure ? | deal-contract-terms (Standard contract terms) | reunion-presentation-fr (Réunion de présentation — programme Nordhavn), playbook-commercial-fr (Playbook commercial — marché francophone), entretien-flotte-fr (Entretien de la flotte de livraison) |

## The caveat

The corpus is synthetic, written by a model: the recall measured on it is a regression gate, not a
quality claim about real workspaces. Sixty-eight questions: ±0.07 on recall is noise. The embedder runs
on the CPU of this machine, shared with the other work that is running.
