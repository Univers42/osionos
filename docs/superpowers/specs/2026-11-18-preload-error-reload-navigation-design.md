# Stale-chunk reload must not abort a navigation (R-BR5) — spec

Status: phase 1 (spec + RED + measurements). Design not ruled by the risk magistrate yet.
Measurements: `/mnt/storage/dlesieur/scratch/rbr5/` (`all.jsonl`, `tables-all.jsonl`, `disc.txt`).

## Defect

`src/app/main.tsx` answers every `vite:preloadError` with `location.reload()` (guard: once per
10 s, `sessionStorage` key `osionos:preload-reloaded-at`). Firefox and WebKit cancel the lazy
imports still in flight when a navigation starts and fire that event for each (Chromium: 0 events
in 40/40 runs). The reload then aborts the navigation under way (Firefox `NS_BINDING_ABORTED`,
WebKit "interrupted by another navigation"). A user hits it on a full navigation shortly after
boot: sign-in redirect, same-tab external link, typed URL.

## Contract

- Input: a `vite:preloadError` event on `window`, plus what the document knows about itself
  (has it started to unload, the guard timestamp, whether the host answers).
- Output: either one `location.reload()` or nothing. Never a reload that cancels a navigation.
- While the page is leaving (`beforeunload` fired) a failure is swallowed, not answered. The
  leaving mark clears 10 s after `beforeunload` or on a bfcache `pageshow`; a swallowed failure on a
  page still alive then reloads once, under the guard (a dismissed "Stay on page", Stop, a 204 or a
  download leave cancelled imports failed). Authority: ADR 0061 PR1-PR9.
- The guard write must read back from `sessionStorage`; without that there is no reload (no
  in-memory fallback, which would loop across reloads).
- Done when S1-S4 below pass on Chromium, Firefox and WebKit in the production build.

## Acceptance

| Id | Criterion | Test |
| --- | --- | --- |
| S1 | A navigation started by the user or the app while lazy imports are in flight is never aborted by this handler: the main frame requests exactly the two documents, no third. | `tests/e2e/bridge-stub/preloadErrorReload.spec.mjs` "S1 ..." (goto and `location.assign`) |
| S2 | A genuinely stale chunk (its URL answers 404 until a redeploy-style reload) triggers exactly one reload and the app then comes up, on all three engines. | same file, "S2 ..." |
| S3 | The loop guard holds: a chunk that stays missing reloads once, not more than once per 10 s. | same file, "S3 ..." |
| S4 | Host unreachable at the boot chunk: today the handler reloads once anyway (the reload then lands on the browser's error page). Kept unless phase 2 records a decision to change it; the test pins today's behaviour. | same file, "S4 ..." |
| U1 | Pure seam: one reload per failure burst per 10 s; none once the document is leaving; a later burst may reload again. | `tests/canvas/preload-recovery.test.ts` (RED until `src/app/preloadRecovery.ts` exists) |

## Does not

- Change what a user sees when a chunk is missing for good (no new error UI, no retry loop).
- Distinguish "chunk missing" from "chunk blocked" (an extension, a captive portal).
- Cover the service worker's own update path (`/sw.js`, ADR 0053); these tests run with workers blocked.
- Handle `vite:preloadError` from the other entries (IDE, terminal, editor builds) unless they
  import the same module.

## Known limits of the tests

- WebKit keeps a failed subresource for the same URL across a reload, so S2 names the chunk
  differently after the reload, as a redeploy does (new hash). Reusing the URL fails on WebKit
  for a reason that is the engine's cache, not this handler.
- On WebKit a navigation started with `location.assign` right after boot cancels the imports in
  only 15 of 20 runs; S1 (assign) can pass without exercising the defect. S1 (goto) is the
  deterministic one there (20 of 20 produce events).
- S1 is vacuous on Chromium (no event fires); it passes there and says nothing.
- Caveat (i): with an unconfirmed edit the page's leave guard asks again when the delayed reload
  runs, so the user sees two dialogs, the second 10 s after the first Stay (2 dialogs in 120/120
  runs on Firefox, WebKit and Chromium). Choosing Stay a second time leaves the failed lazy
  feature broken until a manual refresh. Accepted, not fixed (ADR 0061 PR11).
