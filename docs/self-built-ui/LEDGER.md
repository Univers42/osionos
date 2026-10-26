# Self-built UI — ledger

One row per package. Status: dispatched → returned → reviewed → **merged** (into `feat/self-built-ui`).

| ID | Status | Branch | Session | Gates | Review |
|---|---|---|---|---|---|
| SB-0a | dispatched 2026-10-25 | feat/acct-SB-0a | | | |
| SB-0b | **merged** 44644f73f (2026-10-25) | feat/sb-SB-0b | ses_e8b872945ffecrcm1iAAb16BGt | integration 44644f73f: quality 0, canvas 3989/0; mutants ratchet+1 and extra `<input` killed | fix1 7eaf065bb: a missing dir is named |
| SB-1a | **merged** 27a4870f6 (2026-10-26 01:35) | feat/sb-SB-1a | ses_e8b7e3f1cffecft28jg2ag6NXa | fix1 a16aa52a1 + my cleanup 06599b87b (empty borderSides rules, stale comment): block-style 11/11, canvas 3996/0, quality 0, build 0 with `[data-s-padding="3"]{padding:calc(var(--spacing) * 3)}` and the borderSides rules in build CSS, `$tone-map` 0; my mutant (empty gap rule) killed by "scss has a non-empty rule for every prop value" | round 1 rejected (coverage met by comments, scss never compiled into the app); fix round clean |
| D-SB-1b-spec | devil: PROCEED-WITH-CONDITIONS (blast 4, rev 3, cost 4, conf 2) | — | ses_e8b7d50f0ffeck0l33eF9P22ZZ | — | 9 conditions folded into SB-1b.md (b70ac61a2) |
| SB-1f | **merged** dd00e16bb (2026-10-25) | feat/sb-SB-1f | ses_e8b70a3d1ffeLBYYWFkZNygzs2 | integration dd00e16bb: quality 0, canvas 3994/0; worker mutants 3/3 killed | clean: `rawSourceToBlocks` = parse → applyOverlay(collectOverlay(current)) |
| specs | SB-1c, SB-1d, SB-1e, SB-2a, SB-6a written 2026-10-25 (SB-1e now depends on SB-6a too) | — | — | — | — |
| specs | SB-2b, SB-2c, SB-3b, SB-3c, SB-4c written 2026-10-25 21:20–21:35 (SB-2d split from SB-2b: profile draft + page settings; moderation and per-page overrides → SB-4b) | — | — | — | — |
| SB-2a | **merged** 0738c72c5 (2026-10-26 01:33) | feat/sb-SB-2a | ses_e8b60c53fffebrAcBGDT3vdAUA | fix1 7515d7308 + my indent fix 1ff5d79b4: canvas 4003/0, quality 0; my mutant (loose `settings:` regex) killed by "invalid settings recordRef values are dropped by the page file" | round 1 rejected (settings refs dropped by the page file, no loading→ready notify); fix round clean |
| D-SB-3a-spec | devil: PROCEED-WITH-CONDITIONS (blast 4, rev 3, cost 5, conf 3) | — | selfhost/wf/D-SB-3a-spec.a4 | — | 10 conditions folded into SB-3a.md (278cc0113, bbce581fa): trusted pages, sudo by event, pause around the guard only, canonical args key, no host = no run |
| SB-3a | dispatched 2026-10-25 21:16 (parallel with SB-2a) | feat/sb-SB-3a | | | |
| D-SB-4g-spec | devil: **BLOCK** (blast 3, rev 3, cost 3, conf 4), kimi-k3, 2026-10-26 01:11 | — | ses_e8a7817c2ffeqCZOgW4Tp4sXl6 | — | 11 conditions folded into SB-4g.md; the compose re-bind replaced by a pairing code no route serves; re-rule 01:14: PROCEED-WITH-CONDITIONS (2/2/2/2), 4 more conditions folded; dispatch after SB-1d |
| SB-6a | dispatched 2026-10-25 20:56 (parallel with SB-1b) | feat/sb-SB-6a | | | |
| SB-1c | dispatched 2026-10-25 20:56 (parallel with SB-1b) | feat/sb-SB-1c | | | |
| specs | SB-4f written 2026-10-26 01:27 (base moved to SB-1d: presets are a system-doc kind; adds text-block `style`, `leading`/`minWidth` scales) | — | — | — | — |
| specs | SB-4a written 2026-10-26 01:31 (base SB-2c + SB-3b: inline edit needs the field block, row actions need the button run options; extracts the duplicated `resolveScrollElement`) | — | — | — | — |
| specs | SB-4e written 2026-10-26 01:32 (base SB-4f + SB-3c; eight shipped components, Item list moves to SB-4b) | — | — | — | — |
| SB-2b | dispatched 2026-10-26 01:34 from 0738c72c5 | feat/sb-SB-2b | | | |
| SB-1b | dispatched 2026-10-26 01:35 from 27a4870f6 | feat/sb-SB-1b | | | |
| SB-3a | returned 7025af2a7 (01:33) → fix round 1 (01:39) | feat/sb-SB-3a | ses_e8b4ab48effepqC5o8E7QUIvoC | worker: quality 0, canvas 0, button e2e 0; mutants c, d, f not caught or not run | rejected, 19 items: mine (`useActionState` not a hook, guard host orphans a request, store failures reported ok, 10 alias exports, dead loops, preview writes state) + D-SB-3a-diff |
| SB-4i | dropped 2026-10-26 01:36: no passkey registration exists in the app to rebuild (useAccountPasskeysStore.ts header, ProfileSecurityModals.tsx:125); total 59 → 58 | — | — | — | — |
| D-SB-3a-diff | devil: **BLOCK** (blast 3, rev 2, cost 3, conf 5), kimi-k3, 2026-10-26 01:39 | — | selfhost/wf/D-SB-3a-diff.a1 | — | vacuous wall-clock test, no getLastRun secret test, no sudo test or Caveat, no store spies, guard host strands runs; folded into SB-3a fix 1 items 11-19 |
| specs | SB-4h written 2026-10-26 01:40 (👹: kernel flows hold the TOTP seed and recovery codes; devil spec review next) | — | — | — | — |
| specs | SB-4j written 2026-10-26 01:42 (pipelines extracted so component and source share them; files reach a source through `RecordSource.upload`, never an action arg) | — | — | — | — |
| specs | SB-4b written 2026-10-26 01:46 (pilots only: sessions and passkeys; other lists move to their SB-5 packages; `passkey.remove` adds a confirm today's modal lacks) | — | — | — | — |
| integration | 27a4870f6 (SB-2a + SB-1a merged): quality rc 0, canvas 4014 pass / 0 fail, 2026-10-26 01:46 | — | — | — | — |
| specs | SB-4d written 2026-10-26 01:54, marked 👹 (cell clicks write access policies; restyled live controls only on trusted pages); SB-1e now owns the one trust rule (`pageTrust.ts`, entities); SB-4a rows feed `visibleWhen` as `prop("$row.<field>")` | — | — | — | — |
| D-SB-4h-spec | PROCEED-WITH-CONDITIONS (kimi-k3, 01:49), 12 conditions folded into SB-4h.md 01:54 | — | — | — | — |
| SB-1c | returned af41816e4 (01:50) → fix round 1 (01:53): one snapshot cache shared by all gated blocks, duplicated truthiness, missing counter test, global menu event, dead read-only provider; perf to be measured against base by the reviewer | feat/sb-SB-1c | — | — | — |
| D-SB-4d-spec | PROCEED-WITH-CONDITIONS (kimi-k3, 02:00), 8 conditions folded into SB-4d.md 02:01: page-path load, latest-load-wins, failed save refetches, deny removal confirms, busy by subscription | — | — | — | — |
| specs | SB-6b written 2026-10-26 02:01, marked 👹 (every canvas renderer; V1 would rewrite a fine grid); tray moved to SB-6e; devil D-SB-6b-spec running | — | — | — | — |
| D-SB-6b-spec | PROCEED-WITH-CONDITIONS (beam-free, 02:05; blast 5), 15 conditions folded into SB-6b.md 02:10: guard before every V1 write path on the raw rowHeight, the 56 px Home dashboard named, golden adds 5 shipped canvases and paint order, DOM order = narrowSequence (no style.order), narrowOrder through codec/merge/MCP import, Alt+Arrow single owner, fine-row perf budget | — | — | — | — |
| specs | SB-6c, SB-6f 👹 (bridge) and SB-6f2 (client) written 2026-10-26 02:10; SB-6f split in two, so the plan total is 59; SB-6c deps SB-6a, SB-1b, SB-1c; devil D-SB-6f-spec running | — | — | — | — |
| D-SB-6f-spec | PROCEED-WITH-CONDITIONS (beam-free, 02:12; cost 5), 18 conditions folded into SB-6f.md 02:14: archived pages filtered, page must belong to the workspace, server-derived author fields, rate → audit → write with 503 on audit failure, compare-and-swap on updated_at for both workspace writers (a lost unflag can no longer resurrect a page) | — | — | — | — |
| SB-0a | timed out twice (rc 124, 23:10 and 02:11) on one bug: sections opened by textContent, the Profile row's is "⭐Dylan Admin"; fix round 1 02:14 with the diagnosis and a 6 min test timeout | feat/acct-SB-0a | — | — | — |
| SB-6a | returned 7e74abf8f (02:09) → fix round 1 (02:14): merge the tip (index.ts conflict), one page-action error path (copied from PageHeaderBar.tsx:166-172), render-mode type into the model | feat/sb-SB-6a | — | — | — |
| specs | SB-6m (tree merge, pure), SB-6d 👹 (root table), SB-6d2 👹 (bridge routes + validator agreement) written 2026-10-26 02:23; SB-6d split in four (SB-6d3 client spec waits for a fresh read of the editor's content source); plan total 62; SB-1d's envelope gains `required` | — | — | — | — |
| D-SB-3a-fix1 | BLOCK (beam-free, 02:16; blast 2): 8 of 10 conditions MET; two safety properties lack a failing test (run log carries no secret; guard dialog never strands a run). System-page trust accepted as a deviation for now (no `confirm:"none"` action ships); SB-1e wires it | — | — | — | — |
| SB-3a | fix round 2 (02:24): the two tests, the guard logic moved into a plain controller so the canvas runner can test it, merge the tip (App.tsx) | feat/sb-SB-3a | — | — | — |
| D-SB-6d-spec | PROCEED-WITH-CONDITIONS (beam-free, 02:25; blast 4), 12 conditions folded into SB-6d, SB-6d2 and SB-1d 02:27: walk `layoutCells[].blocks` as well as `children` in both validators, reject prototype keys, a p5 erasure-probe helper for the new table, a real docker build for the schema re-include, 32 copies per user inside the export budget, the four If-Match races | — | — | — | — |
| specs | SB-6d3 (client: document editor source, copy store, Edit this page, Reset) written 2026-10-26 02:27 | — | — | — | — |
| SB-6d | dispatched 02:28 (beam-free) in the ROOT repo: integration branch `feat/self-built-ui` created from root `feat/account-platform` 5ac575bd (worktree groot-wt/SB-root-int), worker worktree groot-wt/SB-6d-root on `feat/sb-SB-6d`; grant checks through rootmg.sh (now takes GROBASE_FROM) | feat/sb-SB-6d (root) | — | — | — |
