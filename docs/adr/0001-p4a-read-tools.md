<!-- Copied from the host repo's template (.claude/templates/adr.md). The host
     repo (the groot root) owes its own copy, numbered in ITS own sequence;
     this one lives with the code it describes. -->

# 0001. The assistant reads the workspace through tools, and the money of a run covers the whole loop

- Status: accepted
- Date: 2026-10-21
- Deciders: the devil (risk magistrate) ruled PROCEED-WITH-CONDITIONS on the P4a design; the builder built the read half under those conditions.

## Context

Facts only, each with a place to verify it. A claim without a location is a
hypothesis, and six months later the reader cannot tell the two apart.

- The P4a design (`scratchpad/design/ai-p4-tools.md`) wants the assistant's
  tools in one library, reads that run and writes that wait for a human. The
  devil's verdict on it is PROCEED-WITH-CONDITIONS with 14 conditions
  (`scratchpad/devil/p4a-verdict.md`).
- The verdict's condition C10 asks for the context of a tool to be split: a
  read tool holds no token, the write path holds it. That is the shape the
  library has (`services/osionos-ai/src/tools/types.ts:31` and `:49`).
- The read rule of the bridge is `canReadPageRowAsMember`
  (`scripts/bridge-page-read.mjs:66`): the caller must be a member of the
  workspace of the page, and the page must be readable by them. The retrieval
  uses the same function as its last word (`services/osionos-ai/src/retrieval/search.ts:229`).
- The workspaces of the caller are read live, from the token and from the
  members table (`services/osionos-ai/src/retrieval/acl.ts:79`), and the route
  of a run only reads them when the client quotes a page
  (`services/osionos-ai/src/routes/runs.ts:102`). A tool may not inherit that
  condition (verdict C11).
- The text of a page is quoted as data: `quotedData`
  (`services/osionos-ai/src/runs/sources.ts:31`) takes away the power of the
  text to be markup, and `pageBlock`
  (`services/osionos-ai/src/runs/prompt.ts:207`) is the block of a quoted page.
- The reservation of a run used to cover ONE call, and the settlement added the
  real spend with no cap check: a tool loop makes up to five calls, so a run
  could book a spend the cap never allowed (verdict C13).
- The estimate of the loop counted ONE tool output per step
  (`TOOL_OUTPUT_CHARS`), and that is not a ceiling: the outputs of the tools
  accumulate (the prompt of the last step holds every one of them), a step may
  call several tools at once, and the definitions of the tools are input on
  every step. The devil's condition C13 asks for a real ceiling.
- The pool of a run was a pool for the WHOLE run: one step that called ten
  tools at once put ten outputs in the prompt of the answer, and the money of
  the answer was reserved for one of them. The share of a step
  (`TOOL_OUTPUT_CHARS`) is what the answer's ceiling counts.
- The ceiling of the answer was the ceiling of the step BEFORE it: the answer
  reads what the tools of that step add, and the money held for it did not
  count it. A step that returned 60 000 characters cost the answer 15 000
  tokens the reservation never paid for.
- The money could stop the loop right after a TOOL step: a provider that
  reported more tokens than the estimate (code, CJK) made the run end on a
  tool call, and the user got no text at all.
- The extension of the reservation of a run was TWO statements: the money of
  the day was taken, and the row of the run was written after it. A crash
  between them kept the money reserved in the day while the row did not know
  it, and the sweep of the stale runs never gave it back.
- The ceiling of the whole loop was reserved UP FRONT, five worst cases at
  once: with a platform model (three dollars a million tokens in, fifteen out)
  and the daily cap of a user (200 000 micro-USD), that reservation is about
  0.41 USD — more than the cap itself. Every run was refused before it
  started, "hello" included.
- The ledger is one row per subject and day, with a hard limit on
  `spent + reserved` (`services/osionos-ai/src/budget.ts:47-55`).
- Unknown when this was written: the cost of the loop in production. The
  reservation of a run is now its first step and the answer that follows it,
  and the loop asks the ledger for the rest as it goes
  (`services/osionos-ai/src/runs/loopBudget.ts`).

## Decision

The model of a run may call tools, and the tools of P4a1 are the two read
tools: `search_workspace` and `read_page`
(`services/osionos-ai/src/tools/readTools.ts:98` and `:134`). They live in one
library, every tool has the same shape, and a run is a loop of at most five
steps (`services/osionos-ai/src/tools/loop.ts:17`).

A read tool holds no token of the caller: the context of a read tool is the
database and the claims of the caller (`services/osionos-ai/src/tools/types.ts:31`),
and the token belongs to the write context alone (`:49`). A read tool reads
the workspace through the rule of the bridge, with the workspaces read live at
the moment of the call, and its result is quoted as data.

The reservation of a run is the ceiling of the WHOLE loop
(`services/osionos-ai/src/runs/estimate.ts:132`), and it is a real ceiling
because of six rules.

**The reservation of a run is the first step, and the answer that follows
it.** (`estimateRunMicroUsd`,
`services/osionos-ai/src/runs/estimate.ts:132`). A step ceiling is what the
step may cost: the prompt it sends (the prompt of the run, the outputs of the
tools, the definitions of the tools) and the output it may write. Reserving
five worst cases at once is what refused every run before it started, and
reserving one call is what booked a spend the cap never allowed.

**The answer is paid for with what the tools add.** The ceiling of the answer
is NOT the ceiling of the step before it: the answer reads what the tools of
that step put in the context, so its ceiling is the ceiling of a step whose
prompt holds the pool of the run AND the share of the step that follows it
(`stepCeilingsMicroUsd`, `services/osionos-ai/src/runs/estimate.ts:104`). The
two numbers live in ONE place, and the runner (up front) and the loop (before
every step) read the same ones: `needed(pool) = ceiling(pool) +
answerCeiling(pool)`, with `growth = min(TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS −
pool)`.

**The pool of the tools.** The outputs of the tools of a run may not put more
in its context than `TOOL_POOL_CHARS` (`services/osionos-ai/src/tools/loop.ts:39`).
The pool belongs to ONE run: it is created with the tool set of the run
(`services/osionos-ai/src/tools/index.ts:106`), and a tool that has no room
left does not run — it answers the model that its reading budget is spent
(`services/osionos-ai/src/tools/index.ts:61`). The notice is paid for by the
pool too, so the context of a run never grows past the ceiling the
reservation counted.

**The share of a step.** The pool has TWO counters: the room of the run, and
the share of the step that is running (`TOOL_OUTPUT_CHARS`,
`services/osionos-ai/src/tools/loop.ts:25`). The share is given back before
every step (`startStep`, `services/osionos-ai/src/tools/index.ts:122`, called
by `prepareStep`, `services/osionos-ai/src/runs/streamPump.ts:154`), so ONE
step adds at most `TOOL_OUTPUT_CHARS` to the context of the run, whatever the
number of the calls it makes at once. The calls that come after the share is
used up get the notice of the pool, and the notice is the pool's own
overhead: it is a few dozen characters per call, and the pool of the run
bounds it.

**The loop reserves as it goes.** Before every step after the first, the loop
knows what the tools have produced, and it asks the ledger for what the step
and the answer that follows it need (`stepHasTools`,
`services/osionos-ai/src/runs/loopBudget.ts:136`). The extension is ONE
atomic reservation (`services/osionos-ai/src/budget.ts:70`): the money of two
runs is never shared, and a run that cannot pay for its next step asks for
the answer instead.

**The last step of the loop answers.** The step that is going to be the last
one — the cap of the steps, or the end of the money — runs WITHOUT tools
(`prepareStep` of `streamText`, `services/osionos-ai/src/runs/streamPump.ts:154`).
The model answers with what it has, and the run ends with an answer instead
of a tool call nobody reads. The SDK honours `toolChoice: 'none'` on the
OpenAI-compatible wire (`tool_choice: "none"` in the request), and the
Anthropic and the Google wires know it too.

**The money never stops the loop after a tool call.** The money is decided in
ONE place, before every step: a step the run cannot pay for becomes the
answer, and the loop is bounded by the cap of the steps alone
(`stopWhen`, `services/osionos-ai/src/runs/streamPump.ts:141`). A stop
condition on the money would fire right after a step whose real cost is
bigger than its estimate (code, CJK), and the run would end on a tool call
with no text at all: the ceiling of a run is kept by the DECISION of the
steps, never by cutting a run in the middle.

**The extension of a run is ONE transaction.** The money of the day and the
row of the run move together (`extendRunReservation`,
`services/osionos-ai/src/runs/extend.ts:21`): a crash between them would keep
the money reserved in the day while the row of the run does not know it, and
the sweep of the stale runs would never give it back. `reserve()` and
`reserveTarget()` take the client of the transaction when the caller has
one (`services/osionos-ai/src/budget.ts:70`), and the other callers are
unchanged.

**The ledger books the real spend.** The settlement of a run books what the
upstream really charged (`services/osionos-ai/src/budget.ts:112`), on the user
and on the platform, and it gives back everything the run holds: the
reservation up front and the extensions of the loop. The money is spent
whatever the ledger says: a ledger that books the reservation instead lets
the platform key run over its daily cap while the ledger says it did not.

The events of a tool are `tool.called` and `tool.result`
(`services/osionos-ai/src/runs/upstream.ts:205` and `:184`). The wire contract
already reserved them for a later phase, and the client ignores the events it
does not know.

## Alternatives considered

Each option loses for a reason a reader can check, not one that sounded good.

- **The tools without the loop**: a library of tools the model never calls.
  The feature would be a pile of code with no user (verdict: the design's own
  §2 puts the tools in the loop).
- **A read context that carries the token, like the design's first draft**:
  the token is a full-account bearer, and a read tool has no use for it. It
  would enlarge the leak surface of every read for nothing (verdict C10).
- **Reserving for one call and letting the loop spend five**: cheaper on the
  ledger, and it books a spend the cap never allowed (verdict C13, E1).
- **Reserving the whole loop up front, five worst cases at once**: it is a
  ceiling, and it refuses every run before it starts: the reservation of a
  five-step loop is more than the daily cap of a user, and "hello" is
  refused like a long search.
- **The ledger books the reservation, and never more than it**: the ledger
  stays inside the cap it was checked against, and it lies: the money is spent
  whatever the ledger says, and the cap that reads a smaller number is a cap
  that does not hold. The ceiling is kept by the decision of the steps.
- **A pool per step instead of a pool per run**: each step would have its own
  budget, and the outputs of the steps would pile up again: the prompt of the
  last step is the one that holds them all. The pool of the run stays, and it
  gains a SHARE for the step that is running: the run still holds everything
  the tools produced, and one step may not add more than a share of it.
- **The money as a stop condition of the loop**: the loop would stop when the
  money ran out, and it would stop wherever it stood: a run whose provider
  reported more tokens than the estimate would end on a tool call, and the
  user would get no text. The money decides the step, not the loop.

## Consequences

- The assistant can search the workspace and read a page by itself: the answer
  no longer depends on the three pages the client quotes.
- The reservation of a run is the first step AND the answer that follows it,
  and the steps after the first ask the ledger for what they need: the run
  holds the money of its first step and of the answer that follows it, and
  the loop grows the reservation only as it spends. A "hello" on a platform
  model is not refused any more, and a run that reads the workspace reserves
  what it reads.
- The answer is paid for with what the tools add: the ceiling of the answer
  holds the pool of the run and the share of the step that follows it, so the
  money a run holds covers the prompt the model really reads. The reservation
  of a "hello" on a platform model is 47 490 micro-USD (16 245 for the step,
  31 245 for the answer), and the cap of the day is 200 000.
- One step adds at most one share (20 000 characters) to the context of a run,
  whatever the number of the tools it calls at once: the tools of a step that
  share the budget of the step, and the calls that come after the share is
  used up are told that the reading budget is spent.
- Every run ends with an answer: the last step of the loop runs without tools,
  so the model writes what it has instead of calling a tool that nobody
  reads. A run that cannot pay for its next step answers instead of reading
  more — and the money never cuts a run in the middle: it is the step that
  becomes the answer, never the loop that stops on a tool call.
- The extension of a run is one transaction: the money of the day and the row
  of the run move together, so a crash between them cannot strand the money
  of the day in a ledger that the sweep of the stale runs knows nothing about.
- The ledger books what the run really cost, even when that is more than the
  reservation: a run that crosses its ceiling is a run that stopped itself,
  and the ledger says what was paid. A cap that reads this ledger is a cap
  that can be crossed by one run — the loop is what keeps the run small.
- The write tools are still owed, and they come with the conditions of the
  verdict that this phase does not touch: C1 (the write schema excludes
  `visibility`, `collaborators`, `properties`, `workspaceId` and `archivedAt`),
  C2 (`archive_page` is the soft archive), C3 (no full replace of a page the
  model did not read in full), C5 (the run gains an awaiting-approval state),
  C6 (the approval row is recoverable), C7 (the crash window is closed), C8
  (duplicate writes are refused), C9 (the card renders every key, as text),
  C12 (the bridge URL is operator configuration), C14 (the table and the route
  are bounded).
- The wire contract of the assistant (`scratchpad/design/ai-wire-contract.md`)
  must carry the shapes of `tool.called` and `tool.result`; they are described
  in `services/osionos-ai/README.md` until it does.
- The ADR of the host repo (the groot root, `docs/adr/NNNN-…`) is owed there:
  this file is the copy that lives with the code.
