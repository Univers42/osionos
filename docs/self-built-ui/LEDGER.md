# Self-built UI — ledger

One row per package. Status: dispatched → returned → reviewed → **merged** (into `feat/self-built-ui`).

| ID | Status | Branch | Session | Gates | Review |
|---|---|---|---|---|---|
| SB-0a | dispatched 2026-10-25 | feat/acct-SB-0a | | | |
| SB-0b | **merged** 44644f73f (2026-10-25) | feat/sb-SB-0b | ses_e8b872945ffecrcm1iAAb16BGt | integration 44644f73f: quality 0, canvas 3989/0; mutants ratchet+1 and extra `<input` killed | fix1 7eaf065bb: a missing dir is named |
| SB-1a | returned a2f0c1e82 → fix round 1 | feat/sb-SB-1a | ses_e8b7e3f1cffecft28jg2ag6NXa | worker: typecheck/lint/canvas/quality 0, no build | rejected: coverage met by comments; borders invisible; -fg tokens for text; stale cache on flat colours; scss @imported from css (not compiled); flat fallback copies raw CSS |
| D-SB-1b-spec | devil: PROCEED-WITH-CONDITIONS (blast 4, rev 3, cost 4, conf 2) | — | ses_e8b7d50f0ffeck0l33eF9P22ZZ | — | 9 conditions folded into SB-1b.md (b70ac61a2) |
| SB-1f | **merged** dd00e16bb (2026-10-25) | feat/sb-SB-1f | ses_e8b70a3d1ffeLBYYWFkZNygzs2 | integration dd00e16bb: quality 0, canvas 3994/0; worker mutants 3/3 killed | clean: `rawSourceToBlocks` = parse → applyOverlay(collectOverlay(current)) |
| specs | SB-1c, SB-1d, SB-1e, SB-2a, SB-6a written 2026-10-25 (SB-1e now depends on SB-6a too) | — | — | — | — |
| specs | SB-2b, SB-2c, SB-3b, SB-3c, SB-4c written 2026-10-25 21:20–21:35 (SB-2d split from SB-2b: profile draft + page settings; moderation and per-page overrides → SB-4b) | — | — | — | — |
| SB-2a | returned 65551b387 → fix round 1 (21:14) | feat/sb-SB-2a | ses_e8b60c53fffebrAcBGDT3vdAUA | worker: canvas 4000, quality 0, profile e2e 6+8 passed; mutant killed | rejected: `blockOverlay.ts:95` drops `settings:` refs from the page file; a source that loads with the field undefined stays "loading"; read() per field in the loop; App.tsx indent; unused test-only export |
| D-SB-3a-spec | devil: PROCEED-WITH-CONDITIONS (blast 4, rev 3, cost 5, conf 3) | — | selfhost/wf/D-SB-3a-spec.a4 | — | 10 conditions folded into SB-3a.md (278cc0113, bbce581fa): trusted pages, sudo by event, pause around the guard only, canonical args key, no host = no run |
| SB-3a | dispatched 2026-10-25 21:16 (parallel with SB-2a) | feat/sb-SB-3a | | | |
| SB-6a | dispatched 2026-10-25 20:56 (parallel with SB-1b) | feat/sb-SB-6a | | | |
| SB-1c | dispatched 2026-10-25 20:56 (parallel with SB-1b) | feat/sb-SB-1c | | | |
