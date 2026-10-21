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
- The ledger is one row per subject and day, with a hard limit on
  `spent + reserved` (`services/osionos-ai/src/budget.ts:47-55`).
- Unknown when this was written: the cost of the loop in production. The
  reservation of a run is now five times what it was, and the daily cap of a
  user is 200 000 micro-USD (`services/osionos-ai/src/config.ts:71`).

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
(`services/osionos-ai/src/runs/estimate.ts:89`), and it is a real ceiling
because of two rules.

**The pool of the tools.** The outputs of the tools of a run may not put more
in its context than `TOOL_POOL_CHARS` (`services/osionos-ai/src/tools/loop.ts:39`).
The pool belongs to ONE run: it is created with the tool set of the run
(`services/osionos-ai/src/tools/index.ts:91`), and a tool that has no room
left does not run — it answers the model that its reading budget is spent
(`services/osionos-ai/src/tools/index.ts:61`). The notice is paid for by the
pool too, so the context of a run never grows past the ceiling the
reservation counted.

**The stop condition of the money.** The loop stops itself when the next step
would cost more than the run holds (`budgetReached`,
`services/osionos-ai/src/runs/streamPump.ts:95`): the cost of the steps that
ran is the usage the provider reported, and the estimate when it reported
nothing, and the next step is not started when that cost plus the ceiling of
one more step passes the reservation. The ceiling of a run is kept by STOPPING
the work, never by under-booking what was paid.

**The ledger books the real spend.** The settlement of a run books what the
upstream really charged (`services/osionos-ai/src/budget.ts:112`), on the user
and on the platform. The money is spent whatever the ledger says: a ledger
that books the reservation instead lets the platform key run over its daily
cap while the ledger says it did not.

The events of a tool are `tool.called` and `tool.result`
(`services/osionos-ai/src/runs/upstream.ts:179` and `:162`). The wire contract
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
- **The ledger books the reservation, and never more than it**: the ledger
  stays inside the cap it was checked against, and it lies: the money is spent
  whatever the ledger says, and the cap that reads a smaller number is a cap
  that does not hold. The ceiling is kept by stopping the loop.
- **A pool per step instead of a pool per run**: each step would have its own
  budget, and the outputs of the steps would pile up again: the prompt of the
  last step is the one that holds them all.

## Consequences

- The assistant can search the workspace and read a page by itself: the answer
  no longer depends on the three pages the client quotes.
- The reservation of every run counts the whole loop: five steps, and in each
  of them the prompt, the pool of the tools and the definitions of the tools.
  It is many times what one call cost, and the cap of the day is checked
  against it. A user with a tight budget sees more refusals (402) than before.
  The day the loop needs its own ceiling per model, this is where it goes.
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
