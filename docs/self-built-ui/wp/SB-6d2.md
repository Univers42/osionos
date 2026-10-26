# SB-6d2 — User copies of settings pages, the bridge half: read, save, reset, and a validator that agrees with the app's (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §7 and §10). SB-6d added `osionos_user_system_pages`. This package adds the routes a user's copy goes through, and the server-side check that a stored tree is a valid system document: the block-type allowlist, the field allowlist, style values on their scales, depth, count and size. A stored tree is user input on both sides of the trust boundary (design §7). The check reads the one generated schema (SB-1d) and is a second implementation of `parseSystemDoc`'s strict mode in plain Node, so an agreement test runs both on the same corpus.

👹 because the bridge stores user-supplied block trees that the app renders inside its own Settings chrome.

Base: the integration tip with SB-1d merged (`src/system-docs/schema.generated.json` and `parseSystemDoc` exist). The table is SB-6d's contract; the bridge tests use the fake pg the other bridge tests use, so SB-6d need not be applied.

## What exists (read these first)

- SB-6d's contract (`docs/self-built-ui/wp/SB-6d.md`): columns, grants, the If-Match `version`.
- `scripts/bridge-account-settings.mjs`: `callerSession`, `accountError`, `readBody`, `respondWithError` (`scripts/bridge-account-sudo.mjs:64-97`), `limitOrFail` (fail-closed rate limit) and `pg.asUser(session)` (every read and write runs under row-level security). Its header's Caveat on error codes applies: never a code ending in `_unavailable` or `_off`.
- `scripts/bridge-account-profile.mjs:15-30,128-129`: the If-Match pattern (428 without the header, 412 with the current row when it moved).
- `scripts/bridge-moderation.mjs:128`: reading a file next to the modules with `new URL(…, import.meta.url)`.
- SB-1d's `parseSystemDoc(raw, "strict")` and `schema.generated.json` (`blockTypes`, `blockFields`, `runtimeFields`, `styleScales`, `limits`).
- `tests/canvas/bridge-page-write-agreement.test.ts`: the agreement-test pattern (a `.ts` test importing a bridge `.mjs`).
- `scripts/bridge-account-mounts.mjs`, `deploy/bridge-fly/Dockerfile` (every module by name), `tests/bridge/bridge-dockerfile-closure.test.mjs`.

**OWNS:**
- `scripts/bridge-system-pages.mjs` (new): the routes;
- `scripts/bridge-system-doc-check.mjs` (new): `checkSystemBlocks(blocks, schema)`, `checkFingerprints(map, blocks)`, `loadSystemDocSchema()`;
- `scripts/bridge-account-mounts.mjs` (one line), `deploy/bridge-fly/Dockerfile` (the two module names and `COPY src/system-docs/schema.generated.json ./src/system-docs/`);
- tests: `tests/bridge/bridge-system-pages.test.mjs`, `tests/canvas/system-doc-check-agreement.test.ts` (new).

**MUST NOT TOUCH:** `parseSystemDoc` and the schema generator (call them), the root repo, `bridge-api.mjs`.

**Commit message:** `feat(bridge): settings-page copies — owner-only read, save and reset, checked against the system-document schema`

## Contract

```
GET    /api/system-pages/settings/<pageId>      200 { copy: Copy | null }
PUT    /api/system-pages/settings/<pageId>      body { baseVersion, blocks, fingerprints }
         no If-Match → create (412 copy_exists with the row if one exists)
         If-Match: <version> → update when the row's version matches (412 with the row as it is now otherwise)
         200 { copy: Copy }
DELETE /api/system-pages/settings/<pageId>      200 { ok: true }   (Reset; deleting no row is still 200)

Copy = { pageId, baseVersion, blocks, fingerprints, version, updatedAt }
pageId: ^[a-z0-9_-]{1,64}$ (404 not_found otherwise, before any read)
Errors: { ok: false, code, message } through respondWithError.
  401 · 404 not_found · 409 too_many · 412 copy_exists / version_mismatch · 413 payload_too_large ·
  422 invalid_<field> / unknown_field / invalid_tree (with `errors: string[]`, each naming a block id and key) ·
  429 · 503 settings_read_failed / system_pages_schema_missing
```

## Rules (each one is tested)

1. **Owner only, by the database.** Every query runs through `pg.asUser(session)`; no query, header or body names a user. Test (fake pg recording the token's `sub`): every call carries the caller's id and none uses the service role. A missing JWT secret answers 503 (as `asUser` does), never a service-role fallback.
2. **The tree is checked before it is stored.** `checkSystemBlocks` implements `parseSystemDoc`'s strict rules over `blocks` alone: an array; every block a plain object with string `id` and `type`; ids unique at every depth; `type` in `blockTypes`; every key in `blockFields`; no key in `runtimeFields`; every `style` value on its `styleScales` scale; depth ≤ `limits.maxDepth`, block count ≤ `limits.maxBlocks`, `Buffer.byteLength(JSON.stringify(blocks))` ≤ `limits.maxBytes`. Any failure is 422 `invalid_tree` with the error list (at most 20), and nothing is written. `checkFingerprints`: a plain object, ≤ `limits.maxBlocks` keys, each key a block-id-shaped string, each value `^[0-9a-f]{8}$`. `baseVersion` is an integer 1–1,000,000. An unknown body key is 422 `unknown_field`. The body limit is `limits.maxBytes` + 64 KiB (413 above).
3. **The two validators agree.** `system-doc-check-agreement.test.ts` runs both on the same corpus: every file in `src/system-docs/**`, and 300 seeded mutations of them (`mulberry32`, `tests/canvas/markdown-fidelity-fixtures.ts:16`): an unknown type, an unknown field, a runtime field, an off-scale style value, a duplicate id, a missing id, a non-string type, depth limit + 1, count limit + 1, byte limit + 1. For each, `parseSystemDoc({ envelope, blocks }, "strict").ok === checkSystemBlocks(blocks, schema).ok`, and the sets of block ids named in the two error lists are equal. A rule added to one side and not the other fails here.
4. **Concurrency.** PUT with `If-Match` filters on `version=eq.<n>` and writes `version: n + 1` and `updated_at: now`; zero rows updated answers 412 `version_mismatch` with the current row. PUT without `If-Match` inserts; a conflict on the key answers 412 `copy_exists` with the current row. Tests: two saves from the same version, the second gets 412 and the row holds the first.
5. **Bounds.** At most 64 copies per user (409 `too_many` on a create beyond it; there are 23 settings pages today). Every PUT and DELETE goes through `limitOrFail(kv, ["system-pages", userId], { limit: 120, windowMs: 60000 })` before any write (autosave sends one write per debounce).
6. **The schema is required.** `loadSystemDocSchema()` reads `../src/system-docs/schema.generated.json` relative to the module once, at first use. When the file is missing or unreadable, every route answers 503 `system_pages_schema_missing` and logs one line; the bridge still boots. Test: with a temp module copy whose relative path has no schema, GET answers 503.
7. **Image closure.** The fly Dockerfile lists both modules and copies the schema; `bridge-dockerfile-closure.test.mjs` passes, and a new assertion in it fails if the schema COPY is missing while `bridge-system-doc-check.mjs` reads the file.

## Steps

- [ ] **Step 1: Failing tests**: `tests/bridge/bridge-system-pages.test.mjs` (Rules 1, 2, 4, 5, 6, DELETE, the 404 on a bad `pageId`), the agreement test (Rule 3), the closure assertion (Rule 7).
- [ ] **Step 2: Run them and see them fail.** `npm run test:bridge -- tests/bridge/bridge-system-pages.test.mjs tests/bridge/bridge-dockerfile-closure.test.mjs`; `npm run test:canvas -- tests/canvas/system-doc-check-agreement.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `checkSystemBlocks` skips the style-scale check;
  - (b) a route uses `pg.asService()`;
  - (c) PUT with `If-Match` does not filter on `version`;
  - (d) `checkSystemBlocks` counts only top-level blocks toward `maxBlocks`.
- [ ] **Step 5: Gates.** `npm run test:bridge` rc 0 (all); `npm run test:canvas` rc 0; `npm run test:quality` rc 0. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the agreement corpus size and result, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
