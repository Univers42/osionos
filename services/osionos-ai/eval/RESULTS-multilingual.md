# Cross-lingual retrieval on the golden set — four variants, measured

- Date: 2026-10-21T11:13:56Z
- Commit: `65e96cf2338ef17c365659b0e0122c3e58ccce23`
- Command: `sh services/osionos-ai/eval/run.sh /tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-ai/models/osionos-ai-migration.sql /tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-ai/models/osionos-ai-rag-migration.sql`
- Images: `pgvector/pgvector:0.8.0-pg16`, `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4` (model `intfloat/multilingual-e5-small`), `node:22-bookworm-slim`
- Variants: A, B, C, D
- The index: 40 pages, 278 chunks, 278 of them with a vector (15.5 s, 5.3 s of page work), 2.34 MB in the database, 52.2 chunks embedded per second

## The gate

A variant wins when xl recall@5 ≥ 0.8 AND fr recall@5 ≥ 0.8, no other kind drops more than 0.07
against A, and the leaks are zero.

| variant | xl recall@5 | fr recall@5 | the worst drop against A | leaks | wins |
| --- | --- | --- | --- | --- | --- |
| A | 0.43 | 0.75 | — | 0 | no — xl recall 0.43 < 0.8 |
| B | 0.57 | 0.85 | multi 0.25 | 0 | no — xl recall 0.57 < 0.8 |
| C | 0.79 | 0.75 | paraphrase 0.14 | 0 | no — xl recall 0.79 < 0.8 |
| D | 0.64 | 0.85 | paraphrase 0.29 | 0 | no — xl recall 0.64 < 0.8 |

## A — retrieve(), unchanged

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
- Latency: p50 11 ms, p95 14 ms (the LLM excluded)
- Latency with the LLM: — (this variant does not call the LLM)
- The cross-lingual questions missed: q51, q53, q55, q56, q57, q58, q59, q64.

## B — the vector list per language, fused with the lexical one

| kind | n | scored | recall@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| lexical | 12 | 12 | 1.00 | 0.625 |
| paraphrase | 14 | 14 | 0.64 | 0.393 |
| multi | 8 | 8 | 0.69 | 0.938 |
| fr | 10 | 10 | 0.85 | 0.650 |
| xl | 14 | 14 | 0.57 | 0.393 |
| negative | 4 | 0 | — | — |
| acl | 6 | 2 | 1.00 | 0.750 |

- Overall: n=68, scored=60, recall@5=0.75, MRR@5=0.567
- Leaks: 0 (none)
- Latency: p50 10 ms, p95 13 ms (the LLM excluded)
- Latency with the LLM: — (this variant does not call the LLM)
- The cross-lingual questions missed: q51, q53, q55, q56, q57, q59.

## C — the query rewritten by the LLM, in English and in French

| kind | n | scored | recall@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| lexical | 12 | 12 | 1.00 | 1.000 |
| paraphrase | 14 | 14 | 0.71 | 0.520 |
| multi | 8 | 8 | 0.94 | 0.938 |
| fr | 10 | 10 | 0.75 | 0.675 |
| xl | 14 | 14 | 0.79 | 0.613 |
| negative | 4 | 0 | — | — |
| acl | 6 | 2 | 1.00 | 1.000 |

- Overall: n=68, scored=60, recall@5=0.83, MRR@5=0.735
- Leaks: 0 (none)
- Latency: p50 18 ms, p95 23 ms (the LLM excluded)
- Latency with the LLM: p50 2612 ms, p95 3864 ms
- The cross-lingual questions missed: q55, q57, q64.

## D — B and C together

| kind | n | scored | recall@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| lexical | 12 | 12 | 1.00 | 0.667 |
| paraphrase | 14 | 14 | 0.57 | 0.315 |
| multi | 8 | 8 | 0.69 | 0.656 |
| fr | 10 | 10 | 0.85 | 0.750 |
| xl | 14 | 14 | 0.64 | 0.482 |
| negative | 4 | 0 | — | — |
| acl | 6 | 2 | 1.00 | 1.000 |

- Overall: n=68, scored=60, recall@5=0.75, MRR@5=0.565
- Leaks: 0 (none)
- Latency: p50 27 ms, p95 36 ms (the LLM excluded)
- Latency with the LLM: p50 2622 ms, p95 3871 ms
- The cross-lingual questions missed: q51, q53, q55, q57, q59.

## The latency

| variant | p50 retrieval | p95 retrieval | p50 with the LLM | p95 with the LLM |
| --- | --- | --- | --- | --- |
| A | 11 ms | 14 ms | — | — |
| B | 10 ms | 13 ms | — | — |
| C | 18 ms | 23 ms | 2612 ms | 3864 ms |
| D | 27 ms | 36 ms | 2622 ms | 3871 ms |

- The LLM alone: p50 2595 ms, p95 3845 ms over 68 calls (one per question).

## The questions no retrieval can answer

| id | asker | expected page | why |
| --- | --- | --- | --- |
| q35 | u_chloe | deal-northlake-hotels (Deal — Northlake Hotels Group (84 rooms)) | the asker may not read the page |

These are a fixed zero in every variant, and every number of the `fr` bucket is read with them in it.

## The cross-lingual questions, one by one

| id | question | expected | A | B | C | D |
| --- | --- | --- | --- | --- | --- | --- |
| q51 | Combien de semaines prend une fabrication sur mesure ? | deal-contract-terms | miss | miss | 2 | miss |
| q52 | Au maximum, combien de jours consécutifs de congé peuvent être pris par an ? | hr-leave-policy | 1 | 1 | 1 | 1 |
| q53 | En quelles quantités commande-t-on les fixations des étagères murales ? | runbook-ordering-spares | miss | miss | 4 | miss |
| q54 | Que fait-on d'un fauteuil qui grince au bout de quelques mois ? | meeting-quality-review-may | 3 | 2 | 1 | 1 |
| q55 | De combien de degrés s'écartent les pieds du fauteuil de salon ? | spec-brindle-lounge-chair | miss | miss | miss | miss |
| q56 | Au bout de combien de temps une opportunité disparaît-elle du rapport ? | meeting-sales-kickoff-q1 | miss | miss | 2 | 4 |
| q57 | Pour combien de réglages en mémoire le bureau à hauteur réglable propose-t-il ? | spec-marlow-standing-desk | miss | miss | miss | miss |
| q58 | Quelle réduction est demandée sur les quantités de panneaux ? | deal-competitive-pricing | miss | 1 | 1 | 1 |
| q59 | Quel chantier a été le premier point de l'ordre du jour, et pour combien de salles d'examen ? | meeting-leadership-retreat | miss | miss | 3 | miss |
| q60 | Que doivent signer les fournisseurs et les visiteurs à l'accueil ? | hr-code-of-conduct | 1 | 2 | 1 | 2 |
| q61 | Who writes the quotes that go to the French market? | playbook-commercial-fr | 2 | 2 | 1 | 2 |
| q62 | How often is the delivery fleet inspected? | entretien-flotte-fr | 1 | 2 | 1 | 1 |
| q63 | How much money was budgeted for the Hamburg refurbishment, and over what period? | reunion-presentation-fr | 1 | 2 | 1 | 1 |
| q64 | In an archive room, what happens to the floor over the seasons? | cahier-des-charges-rive-nord-fr | miss | 1 | miss | 2 |

The cell is the rank of the answer page in the answer of the variant, or `miss`.

## The negative questions — the raw cosine of the best vector hit (variant A)

| id | kind | question | cosine | answered |
| --- | --- | --- | --- | --- |
| q01 | lexical | What is the lead time in weeks for the NW-LARK-77 frame kit? | 0.8590 | yes |
| q02 | lexical | Which timber and finish does the NW-HALDEN-03 top use? | 0.8356 | yes |
| q03 | lexical | How many modules are in the NW-VESPER-12 configuration? | 0.8693 | yes |
| q04 | lexical | What is the maximum load rating of the NW-MARLOW-21 frame? | 0.8524 | yes |
| q05 | lexical | Which upholstery options are approved for the NW-BRINDLE-08 shell? | 0.8666 | yes |
| q06 | lexical | How long does it take to assemble the NW-FJORD-15 bench sections? | 0.8855 | yes |
| q07 | lexical | What does error ERR-4712 mean when a node joins the pool? | 0.9316 | yes |
| q08 | lexical | What causes error ERR-6083 during the nightly invoice run? | 0.8722 | yes |
| q09 | lexical | When does the project codenamed ATELIER-BRIDGE start and how long does it run? | 0.8595 | yes |
| q10 | lexical | What reduction is being asked for in the negotiation tracked as PEREGRINE-LOOM? | 0.8490 | yes |
| q11 | lexical | What surcharge applies to the NW-FERROLLE smoked oak line? | 0.8557 | yes |
| q12 | lexical | What was recorded under the audit reference AUDIT-77? | 0.7992 | yes |
| q13 | paraphrase | How are a newcomer's opening days organised, and who validates the checklist afterwards? | 0.8479 | yes |
| q14 | paraphrase | How often may a colleague stay out of the office after settling in? | 0.8067 | yes |
| q15 | paraphrase | How far ahead must time off be entered, and what is the longest unbroken stretch someone may take? | 0.8521 | yes |
| q16 | paraphrase | What must an outside party do before entering the production area, and who accompanies them inside? | 0.8160 | yes |
| q17 | paraphrase | What must be worn where the timber is smoothed, and which machine has to be working at the same time? | 0.8227 | yes |
| q18 | paraphrase | What actually limits what we can promise to a client? | 0.8324 | yes |
| q19 | paraphrase | How do we respond to a client who asks for a large reduction? | 0.8460 | yes |
| q20 | paraphrase | Which storage line is used in the collection room, and why is it the only one that can be raised off the ground? | 0.8500 | yes |
| q21 | paraphrase | After how long does an entry disappear from the forecast? | 0.8696 | yes |
| q22 | paraphrase | Why do we leave the existing desk frame alone for a year? | 0.8627 | yes |
| q23 | paraphrase | What happens when a seat starts making noise after half a year? | 0.8536 | yes |
| q24 | paraphrase | In what quantity should we buy the hardware that disappears fastest? | 0.8150 | yes |
| q25 | paraphrase | What happens to a request that arrives after the cover has run out? | 0.8242 | yes |
| q26 | paraphrase | Who does the head of the Lyon office answer to for workload and for prices? | 0.8413 | yes |
| q27 | multi | What is the committed value of the museum wing and of the hotel room programme? | 0.8167 | yes |
| q28 | multi | What are the three payment milestones, and when does the hotel programme expect the first one? | 0.8397 | yes |
| q29 | multi | How much is the café programme worth, and what is the total open pipeline for the quarter? | 0.8561 | yes |
| q30 | multi | What is the value of the harbour property programme, and what discount limit applies to a project of that size? | 0.8249 | yes |
| q31 | multi | How many rooms does the clinic programme cover, and what did the leadership meeting decide about it? | 0.8363 | yes |
| q32 | multi | Which parts do we keep in stock, and what did the workshop meeting decide about the paint line? | 0.8738 | yes |
| q33 | multi | How many days may a colleague work from home, and how much annual leave must be booked ahead? | 0.8607 | yes |
| q34 | multi | Which timber does the conference table keep, and what did the product council decide to drop from the range? | 0.8403 | yes |
| q35 | fr | Quelle valeur commerciale a été arrêtée avec le groupe hôtelier, et pour combien de chambres ? | 0.7918 | yes |
| q36 | fr | Quels justificatifs faut-il joindre pour faire ouvrir un dossier de garantie ? | 0.8373 | yes |
| q37 | fr | Que vérifie-t-on chaque semaine sur les engins de livraison ? | 0.8847 | yes |
| q38 | fr | Qui prépare les propositions destinées au marché local ? | 0.8259 | yes |
| q39 | fr | Quel est le budget du programme Nordhavn et quel paiement est prévu pour la première tranche ? | 0.8797 | yes |
| q40 | fr | Quel délai de livraison est garanti pour le système d'étagères NW-CEDAR-40 ? | 0.8799 | yes |
| q41 | negative | What is the delivery lead time for the Kestrel teak outdoor line? | 0.8125 | no — nothing answers it |
| q42 | negative | Who signs off discounts above fifty thousand on the Orenda programme? | 0.8030 | no — nothing answers it |
| q43 | negative | How does the Tessin assembly cell recover after a spindle jam? | 0.7999 | no — nothing answers it |
| q44 | negative | What is the escalation path for a Bramble line warranty claim? | 0.8434 | no — nothing answers it |
| q45 | acl | What is the total fit-out value of the Quadrum project and when did the site survey happen? | 0.8011 | yes |
| q46 | acl | What is the total fit-out value of the Quadrum project and when did the site survey happen? | 0.8748 | yes |
| q47 | acl | How many examination rooms does the Arcway programme cover and what is its total value? | 0.8047 | yes |
| q48 | acl | How many examination rooms does the Arcway programme cover and what is its total value? | 0.8648 | yes |
| q49 | acl | What are the salary bands for the workshop team in 2026? | 0.8174 | yes |
| q50 | acl | What are the salary bands for the workshop team in 2026? | 0.8174 | yes |
| q51 | xl | Combien de semaines prend une fabrication sur mesure ? | 0.8601 | yes |
| q52 | xl | Au maximum, combien de jours consécutifs de congé peuvent être pris par an ? | 0.8283 | yes |
| q53 | xl | En quelles quantités commande-t-on les fixations des étagères murales ? | 0.8415 | yes |
| q54 | xl | Que fait-on d'un fauteuil qui grince au bout de quelques mois ? | 0.8499 | yes |
| q55 | xl | De combien de degrés s'écartent les pieds du fauteuil de salon ? | 0.8258 | yes |
| q56 | xl | Au bout de combien de temps une opportunité disparaît-elle du rapport ? | 0.8273 | yes |
| q57 | xl | Pour combien de réglages en mémoire le bureau à hauteur réglable propose-t-il ? | 0.8428 | yes |
| q58 | xl | Quelle réduction est demandée sur les quantités de panneaux ? | 0.8241 | yes |
| q59 | xl | Quel chantier a été le premier point de l'ordre du jour, et pour combien de salles d'examen ? | 0.8319 | yes |
| q60 | xl | Que doivent signer les fournisseurs et les visiteurs à l'accueil ? | 0.8439 | yes |
| q61 | xl | Who writes the quotes that go to the French market? | 0.8086 | yes |
| q62 | xl | How often is the delivery fleet inspected? | 0.8182 | yes |
| q63 | xl | How much money was budgeted for the Hamburg refurbishment, and over what period? | 0.7984 | yes |
| q64 | xl | In an archive room, what happens to the floor over the seasons? | 0.8295 | yes |
| q65 | fr | Quelles informations sont consignées après une inspection ? | 0.8456 | yes |
| q66 | fr | Quel taux de remise déclenche une double signature ? | 0.8363 | yes |
| q67 | fr | Quels documents avons-nous transmis à l'architecte ? | 0.8614 | yes |
| q68 | fr | Qui consulte le cahier des charges avant de passer commande ? | 0.8563 | yes |

- The lowest cosine of a question that found its page: 0.7984 (q63).
- The highest cosine of a negative question: 0.8434 (q44).
- A threshold would NOT separate them in this run: a negative question is at least as close to a chunk as an answered one.
- Caveat: the cosine is the similarity of the best VECTOR hit, which is not the page the answer holds.
  The vector side always has a neighbour, even for a question nothing answers.

## The recommendation

**No variant wins the gate.** The nearest is C — xl recall@5 0.79 against the 0.80 the gate
asks for — and it pays 0.14 of paraphrase to get there. Below is what the four runs say,
and what to try next.

### What is confirmed

The hypothesis of the brief holds. In the baseline, a French question comes back with the
French pages: seven of the cross-lingual questions the baseline misses (q51, q53, q55, q56,
q57, q58, q59) return nothing but French pages, and the eighth (q64, the mirror case — an
English question about a French page) returns nothing but English ones. The lexical half
cannot help: the `simple` dictionary matches whole tokens, and a French token is not an
English one. The vector half does not help either: the nearest chunks of a French query are
the French ones. The cross-lingual recall@5 of the service is 0.43.

### What each variant buys, and what it pays

| variant | xl | fr | overall | the bill |
| --- | --- | --- | --- | --- |
| A | 0.43 | 0.75 | 0.78 | the misses of the brief |
| B | 0.57 | 0.85 | 0.75 | multi −0.25, paraphrase −0.22 |
| C | 0.79 | 0.75 | 0.83 | paraphrase −0.14, 2.6 s of LLM per question |
| D | 0.64 | 0.85 | 0.75 | paraphrase −0.29 |

The bill of B and D has the same cause, and it is the fusion and not the retrieval: the
reciprocal rank fusion SUMS the ranks, so the first chunk of a list scores 1/61 whatever
the list is. Split the vector side per language and the first chunk of the French list
competes with the answer of an English question at 1/61 — and a tie is broken by the chunk
id, not by the score. Every list the fusion is given takes slots from the answer. C pays
the same bill for the same reason: the French rewrite is a list, and its chunks take slots
of the top five. The rewrite is not the cause — for q16, the one C loses, the English
rewrite is the question, word for word.

D is the proof: the per-language split undoes what the rewrite buys.

The `fr` bucket needs one more word: q35 asks u_chloe for a page she may not read, so it is
a fixed zero for every variant (see above). The `fr` numbers of the table are read with
that zero in them, and the gate (fr ≥ 0.8) is harder than it looks.

### The next experiment

**`intfloat/multilingual-e5-base` (768 dimensions), on the same corpus, the same gate and
the same runner.** The three cross-lingual questions C still misses are not fusion
problems, they are ranking problems of the translated query:

- q55 — the LLM rewrote "le fauteuil de salon" as "the sofa chair", and the sofa pages come
  back;
- q57 — "memory settings" where the corpus says "memory positions";
- q64 — "the floor" where the corpus says "the humidity floor", and the brightwater page,
  which holds that word, comes back first.

A wider model ranks those better. It is also the only thing that touches the two French
questions the baseline misses on an English page (q36, and q35 once its asker may read the
page), because their answers are reached through a French question and a French vector.

Its cost, measured here rather than guessed:

- **the vectors double** (384 → 768 dimensions). The index of this corpus is 2.34 MB for
  278 chunks, of which the vectors are 208 KB; they become 417 KB, and the HNSW graph grows
  with them. On a corpus like this one the total would go to about 2.55 MB (+9%); on a real
  one, where the vectors and their graph are the bulk, it is close to ×2.
- **the backfill is the real bill**: every chunk is re-embedded. The rate measured here is
  52 to 55 chunks per second on this shared CPU with the small model (278 chunks in about
  5 s of page work). The base model costs about two to three times the compute per chunk,
  so the rate falls to roughly 20-27 chunks per second. A workspace of 100,000 chunks is
  then one hour to an hour and a half of backfill, on one CPU — and the old vectors have to
  be swapped in one page at a time, so the retrieval of a workspace in migration answers
  with the old model until the backfill is done.

### The cheap companion, before or instead

The numbers say the fusion is the other half of the problem, and the fix is a few lines of
SQL: a variant **E** that keeps the ORIGINAL question next to the rewrite — so the chunk
of the answer is in two vector lists and wins the tie it cannot win today — and drops the
per-language split, which is what costs B its multi and its paraphrase. It should keep
what C wins and give back what C pays. It costs one LLM call per question (2.6 s p50 on
this CPU) and no reindex.

### What to do now

Nothing in `src/` changes: the baseline still answers a French question with the French
pages, and that is the honest state of the service today. If a bilingual workspace is a
near-term goal, run the two experiments above on this corpus — the embedder first (it is
the one that touches the misses that no fusion can), the fusion variant right after it (it
is cheap and it is the one that gives back the paraphrase).

## Caveat: the corpus, the questions and the machine

The corpus is synthetic, written by a model: the recall measured on it is a regression gate, not
a quality claim about real workspaces. Sixty-eight questions over forty pages: one question is
0.07 of the cross-lingual bucket, so ±0.07 on recall is noise. The embedder and the LLM run on the
CPU of this machine, shared with the other work that is running, and the LLM latency is the
latency of a 4B model on eight shared cores, not the latency of a hosted one.
