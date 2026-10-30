# M4 — Moderation: L0 rules, L1 in log mode, and why auto-removal stays off

The M4 slice of the AI plan, moderation of user text:
a rules layer (L0) that warns or holds before a comment is written, a
classifier (L1) that scores the comment afterwards, and an admin console where
a human decides. Nothing is taken away by a machine.

Everything here is bound to the conditions **C83–C97** of
the images and moderation devil verdict (conditions C83–C97), kept with the
project's review records outside this repository. Each condition is summarised
in one line below; the verdict text is not copied here. The out-of-scope of
this slice is written at the bottom.

**Status: L1 runs in `log` mode on the public stack, and holds only where an
operator configured it. There is no auto-removal anywhere.** Reason: on the
out-of-distribution HateCheck set no threshold reaches a precision of 0.95 in
any language, so the floor of C83 is not met
(`services/osionos-ai/spikes/a1/results/encoders/RESULTS.md:37-41`, tables in
"The numbers"). The setting `OSIONOS_MODERATION_ACTIONS=on` is refused by the
worker and runs as `hold` (`services/osionos-ai/src/moderation/policy.ts`,
header).

---

## What an evaluator does in three minutes

On ai-dev (the isolated `ai-dev-*` stack, never the live one). Two switches
must be set on the bridge, and both are off by default:
`OSIONOS_MODERATION_ACTIONS=hold` (the default `log` records the would-be
verdict and shows the author nothing, `scripts/bridge-moderation.mjs`,
`moderationMode`) and `OSIONOS_MODERATION_STATE=1` (only after the groot
migration `models/osionos-ugc-moderation-migration.sql` is applied,
`scripts/bridge-moderation-gate.mjs`, header). The jobs worker runs with
`OSIONOS_MODERATION_ACTIONS=log`.

**1. The L0 warning.** On a public page or post, write a comment containing a
word from `scripts/moderation-lists/en.txt` (for example `acrotomophilia`,
line 3). The bridge answers 409 `moderation_warning` and writes nothing; the
author sees the notice (`src/shared/moderation/ModerationWarningNotice.tsx`).

**2. Post anyway.** Confirm the notice. The comment is written, and the gate
records one `l0` row with the action `warn`. The database trigger of the
migration enqueues a `moderate` job; the worker (`osionos-ai-jobs`) asks the
tox TEI and writes one `l1` row. In `log` mode that row says what the worker
would do, and the comment stays visible.

**3. Read the audit.** The row is in `ai_moderation_events` (columns from
`models/osionos-ugc-moderation-migration.sql:143-158`; the table holds the
content as a sha256, never the text):

```sql
SELECT ts, layer, action, mode, scores, reason
FROM public.ai_moderation_events
WHERE subject_kind = 'page_comment'   -- or 'feed_comment'
  AND subject_id = '<the comment id>'
ORDER BY ts;
```

Expected: an `l0` row (`warn`) then an `l1` row (`allow`, or `hold` as the
would-be action with `mode = 'log'`).

**4. The console.** Open the admin space (`ModerationQueue.tsx`, admin only).
The queue lists **held comments and open reports**, not every scored comment
(`scripts/bridge-moderation-console.mjs`, header). A comment scored in `log`
mode is therefore **not** in the queue: it is in the SQL above. To see one in
the console, post a comment with more than five links on a public page (L0
holds it: "a link flood on a public post is written HELD, and nobody is told") or file a report. Opening an
item writes a `view` row first (C92).

---

## The commands (the gates)

```sh
# The L0 rules, the gate, the comment surfaces and the console (no stack needed).
docker run --rm --network none -v "$PWD":/app:ro -w /app node:22-bookworm-slim \
  node --test tests/bridge/bridge-moderation.test.mjs \
  tests/bridge/bridge-moderation-gate.test.mjs \
  tests/bridge/bridge-comment-moderation.test.mjs \
  tests/bridge/bridge-moderation-console.test.mjs

# The L1 worker (throwaway Postgres + Redis, the AI migrations, the suite).
# tests/moderationL1.test.ts, moderationL1Guards.test.ts, moderationPolicy.test.ts
# and moderationNoDelete.test.ts are on develop since osionos #93; they skip when
# the moderation migration is not applied.
sh services/osionos-ai/scripts/test.sh <the AI migrations> <osionos-ugc-moderation-migration.sql>

# The client.
bash scripts/docker-run.sh test-canvas
bash scripts/docker-run.sh typecheck
bash scripts/docker-run.sh lint

# The stack (groot worktree): the tox TEI and the jobs worker are in the `ai` profile and
# moved to `ai-classify` by the public overlay, which the public stack never passes.
bash scripts/verify/ai-public-flags-off.sh
```

The totals of a full run of these suites are **not recorded** in this sheet:
see "What is not done".

---

## The cascade, and where each part is

| Layer | What it does | Where |
|---|---|---|
| **L0 rules** | Synchronous, in-process, before the write: NFKC + casefold + zero-width stripping, word-boundary blocklist match, PII shapes, link count. May warn or hold, never remove. | `scripts/bridge-moderation.mjs`; the decision table in `scripts/bridge-moderation-gate.mjs`; lists `scripts/moderation-lists/{en,fr,es}.txt` (LDNOOBW, CC BY 4.0, pinned commit and sha256 in `scripts/moderation-lists/README.md`, licence in `LICENSE`) |
| **L0 in clients** | Understands the 409 `moderation_warning` and shows the notice; the matched terms stay on the author's screen. | `src/shared/moderation/moderationWarning.ts`, `ModerationWarningNotice.tsx` |
| **L1 worker** | Drains `moderate` jobs, asks the tox TEI, writes one audit row; only in `hold` mode moves a comment to `held`. Fail-open: a classifier error retries and the comment stays visible. | `services/osionos-ai/src/moderation/l1.ts`, `policy.ts`, `src/jobs/main.ts` (osionos #93, merged; on develop) |
| **Review console** | Queue of held comments and reports, the item (audited), hide and restore as a soft state. | `scripts/bridge-moderation-console.mjs`, `src/widgets/admin-space/api/moderationClient.ts`, `src/widgets/admin-space/ui/ModerationQueue.tsx` |
| **Compose** | `osionos-ai-tox` (TEI cpu-1.9.4 by digest, offline, internal network, no port), `osionos-ai-sentiment` and `osionos-ai-jobs`, in the `ai` profile; the public overlay moves all three to `ai-classify`. Not started on public. | groot PR #120 (MERGED). Its checks: `docker compose ... --profile ai config --quiet` rc=0; `bash scripts/verify/ai-public-flags-off.sh` -> `PASS 44 checks`; tox and the worker were not started in that smoke |

L2 (the judge, C93) does not exist yet.

---

## What proves what

Test files are on this branch unless marked "develop". `bridge-moderation-console.test.mjs`
and the L1 tests name their conditions in comments or titles; the rest are
matched by what the test says.

| Condition | What it says (one line) | Where it is proved |
|---|---|---|
| **C83** | Shadow first; no auto-remove without per-language precision evidence | develop: `services/osionos-ai/tests/moderationL1.test.ts` ("on never removes: it holds (C83)"), `moderationPolicy.test.ts` ("on is treated as hold: auto-remove is refused (C83)"). The evidence side is the HateCheck table in "The numbers": the floor is not met, so nothing more is enabled |
| **C84** | L0 never removes; no match inside a longer word | `tests/bridge/bridge-moderation.test.mjs` ("C84: a list term inside a longer word never blocks a benign sentence", "never matches a term that sits inside a longer word", "never returns a remove verdict, over every fixture line and every surface", "folds fullwidth letters, a soft hyphen, zero-width spaces and case into the plain word") |
| **C85** | Mode switch, and a changed policy drops to `log` | `tests/bridge/bridge-moderation.test.mjs` ("is log when unset, empty or unknown, and the valid value otherwise", "holds a policy hash that changes with the list and with the thresholds", "effectiveVerdict allows everything in off and log, and enforces in hold and on"); develop: `moderationPolicy.test.ts` ("a hash that is not the calibrated one drops to log (C85)"), `moderationL1.test.ts` ("a policy that is not the calibrated one runs in log mode even if the env says hold (C85)"). The breaker (a cap on auto-actions) is not built: nothing auto-removes, see "What is not done" |
| **C86** | Soft state only, never DELETE | `tests/bridge/bridge-moderation-console.test.mjs` ("hide: the state is removed, the audit says who, and the reports are resolved", "restore: the state is visible again, and the audit says restore"); develop: `moderationNoDelete.test.ts` ("has files to check" and one "has no DELETE and no 'removed'" test per file of `src/moderation`) |
| **C87** | Readers filter held content | `tests/bridge/bridge-comment-moderation.test.mjs` ("a held comment is the author's alone", "the flag set: the list carries the or= filter of the session user", "an edit of a held comment with a clean text never un-holds it", "a comment that is NOT held still tells the owner (the control)"). Covers the two comment surfaces only; search, RAG chunks, the public snapshot and the media routes are not covered. A feed comment that L1 holds after it was published is retracted live: the bridge polls the audit table and publishes `feed_comment_held` on `feed:<workspace>` (`scripts/bridge-moderation-retract.mjs`, `tests/bridge/bridge-moderation-retract.test.mjs`, #72). Page comments have no live channel; a hold there shows on the next load |
| **C88** | Write sites by test, async net by trigger | The trigger is in the groot migration (`models/osionos-ugc-moderation-migration.sql`); develop: `moderationL1Guards.test.ts` ("end to end: a comment inserted on a public page is drained by the JobWorker"). No test lists the write sites: no test |
| **C89** | No stale verdict | develop: `moderationL1Guards.test.ts` ("content edited after the enqueue (sha mismatch): no row, no state change (C89)", "content edited while the classifier runs: the verdict of v1 never lands on v2 (C89)"), `moderationL1.test.ts` ("a held comment edited to kind text stays held, and the new verdict is an audit row (C89)") |
| **C90** | Fail mode per surface | develop: `moderationL1.test.ts` ("the classifier down: the handler throws, no row, the comment stays visible (C90)"). Only comments exist; the fail-closed publish path is not part of this slice |
| **C91** | The console checks admin in the database | `tests/bridge/bridge-moderation-console.test.mjs` ("a token WITHOUT the claim: 403, and not one call to the database", "a token WITH the claim but a row that says false: 403, and nothing is written (the stale claim)", "a row that cannot be read: 503, never \"allowed\""); the same rule for the recs health in `bridge-recs-health.test.mjs` |
| **C92** | Append-only audit, private scores, reads audited | `tests/bridge/bridge-moderation-console.test.mjs` ("the reading is audited BEFORE the answer (C92)", "the content, the state and the audit of the subject"); `bridge-moderation-gate.test.mjs` ("inserts ONE row of ai_moderation_events, with the content as a sha256", "never writes the content and never writes the terms (C94)"); develop: `moderationL1.test.ts` ("log lines carry ids, action and mode, never the text or the score (C92)"). The grants and the append-only trigger live in the groot migration; no test here runs them |
| **C93** | The L2 judge is boxed | No test: L2 does not exist |
| **C94** | DMs and private content: report-driven only | `tests/bridge/bridge-comment-moderation.test.mjs` ("a private post is never held and never recorded (C94)" group: "the feed: the link flood is a warning, not a hold", "the page: the link flood is a warning, not a hold", "a public WORKSPACE makes a private page public-readable"); `bridge-moderation-gate.test.mjs` ("a private subject is never held and never recorded (C94)"); `bridge-moderation.test.mjs` ("links: more than five links hold a post, and a DM is capped at warn (C94)"); develop: `moderationL1Guards.test.ts` ("a comment on a private page: no row, and the classifier is never asked (C94)") |
| **C95** | Mutes from upheld decisions only | No test: no mute exists |
| **C96** | Reports fixed (CHECK, validation, rate limit) | No test in this slice's files. The console reads reports ("the open reports, with their reporter and their subject"); the CHECK widening is in the groot migration, and its test is not part of this sheet |
| **C97** | VLM safety flag = hold, public only | No test here: it belongs to the M7 sheet. This sheet found no code that feeds the VLM flag into the hold path |

---

## The numbers

L1 model: `tox-xlmr-large` (`textdetox/xlmr-large-toxicity-classifier-v2`).
Source: `services/osionos-ai/spikes/a1/results/encoders/RESULTS.md:24-41`.

| Set | Lang | Rows | Toxic | Best-F1 t | P | R | F1 | Lowest t with P ≥ 0.95 (Wilson low) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HateCheck | en | 3728 | 2563 | 0.50 | 0.776 | 0.865 | 0.818 | **none** |
| HateCheck | fr | 3718 | 2600 | 0.51 | 0.798 | 0.739 | 0.767 | **none** |
| HateCheck | es | 3745 | 2632 | 0.50 | 0.785 | 0.880 | 0.830 | **none** |
| textdetox | en | 5000 | 2500 | 0.81 | 0.995 | 0.996 | 0.996 | 0.50 (0.989) |
| textdetox | fr | 5000 | 2500 | 0.72 | 0.994 | 0.998 | 0.996 | 0.50 (0.989) |
| textdetox | es | 5000 | 2500 | 0.50 | 0.982 | 0.987 | 0.985 | 0.50 (0.976) |

Latency: one 32-token text p50 85.6 ms / p95 102.8 ms; a batch of 32 p50 2399
ms (82 ms per text). RSS 3.38 GiB (same file, line 35).

**Reading** (same file, lines 37-41, shortened): textdetox is the model's own
task family, so its 0.99 is not evidence. HateCheck is the out-of-distribution
test, and there no threshold reaches a precision of 0.95 in any language. The
C83 floor (≥ 0.95 per language on ≥ 100 items) is not met: L1 ships log-only
plus hold-for-review, never auto-remove.

Bounds that the L0 tests enforce (these are limits in the code, not
measurements): p95 under 5 ms for a 2,000-character text
(`bridge-moderation.test.mjs`, "checks a 2,000-character text in under 5 ms at
p95"), and under 20 ms, best of five runs, on four 20,000-character inputs built
to make a regex backtrack ("stays linear on 20,000-character inputs built to
make a regex backtrack", commit `e18606863`). The measured p50 and p95 the
first test prints are **not recorded** in any file I could cite.

Hardware of the L1 numbers: not stated in RESULTS.md. The compose limit for the
tox service is 5 GiB, set from the RSS above plus 30 % (groot PR #120).

---

## The pinned things

| what | value |
|---|---|
| L1 model | `textdetox/xlmr-large-toxicity-classifier-v2`, revision `38ab1b77bd3ff7779777cfa5cda203d9912b14b9`; weights sha256 `fa9c7ecbf7df7008f04051c22445b39e01513bcc81edca857a6e9d33a8e8542c` (`services/osionos-ai/spikes/a1/models.lock:103-108`) |
| hold threshold | `0.9` toxic score (`DEFAULT_HOLD`, `policy.ts`); the policy hash covers model, revision and threshold, and another hash than `OSIONOS_MODERATION_CALIBRATED_POLICY` runs in `log` |
| TEI | cpu-1.9.4 by digest, offline (groot PR #120) |
| lists | LDNOOBW at commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13`, unmodified; en 403 lines, fr 91, es 68 (`wc -l`); CC BY 4.0 (`scripts/moderation-lists/README.md`) |
| modes | `off \| log \| hold \| on`; unset, empty or unknown is `log`; `on` runs as `hold` |
| state flag | `OSIONOS_MODERATION_STATE=1`, only after the groot migration |

---

## What is not done

- **Auto-removal (C83).** Blocked by the numbers above. Re-measure on real,
  labelled osionos reports before any change. The breaker of C85 (a cap on
  auto-actions) waits for that.
- **L2, the judge (C93).** Not built.
- **Mutes and appeals (C95).** Not built.
- **Report hardening (C96).** Not covered by a test in this sheet.
- **A test that lists every write site (C88).** The trigger exists in the
  migration; no test enumerates the writers.
- **Readers beyond comments (C87).** Search, RAG chunks of a public page,
  persisted notification previews, the public snapshot and the media routes do
  not filter on the moderation state.
- **The console for log-mode scores.** The queue shows held comments and
  reports only; a comment scored in `log` is readable through the audit table.
- **Messages, profiles, pages, marketplace.** The L1 worker drains `feed_comment`
  and `page_comment` only.
- **Totals of a full run and the L0 timings.** Not recorded in any file: "not
  measured".
- **Course lessons `18/29` and `19/85`-`19/87`** (the plan's M4 text). The plan
  text is not in this repository, so this sheet cites the lesson numbers only;
  it does not restate them.
- **Shadow decisions on real traffic** (part of C83's sheet). None recorded.

---

## Caveats

- **Caveat: textdetox is in-distribution (C83).** The model was built for that
  task family and its training data likely overlaps the set, so the 0.99 is not
  evidence of anything on osionos text.
- **Caveat: HateCheck misses the precision floor, so there is no auto-removal
  (C83).** The best precision per language is 0.776 (en), 0.798 (fr), 0.785
  (es). A human decides, always.
- **Caveat: the blocklists are word lists (C84).** They miss paraphrase,
  obfuscation and leetspeak, and flag a word used innocently (medical,
  reclaimed, a surname). The language is not detected, so a word benign in one
  listed language warns when it is listed in another. A clean L0 verdict is not
  a clean bill of health.
- **Caveat: L1 is asynchronous.** A toxic comment is visible until the worker
  scores it, and in `log` mode it stays visible after.
- **Caveat: the L0 timing tests are bounds.** A regression under 20 ms on its
  best run passes (the caveat in the test).
- **Caveat: the tox RSS is one measurement.** A host note saw 6.4 GiB in a long
  run (groot PR #120), above the 5 GiB limit.
