# SB-4g — Dev authoring loop: "Export as system document" (self-built UI, phase S4) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §10 "Dev export"). A settings page is authored in the editor like any page, then exported into the repo as a canonical system document (`src/system-docs/<kind>/<id>.json`). This package adds the export: a page-menu item in dev, and a Vite middleware that exists only in `vite serve` and writes the file.

👹 because an HTTP request writes into the source tree. Any web page the developer opens can send a request to `localhost`, so the middleware must refuse cross-site requests and confine the path.

Base: the integration tip with SB-1d merged.

## What exists (read these first)

- SB-1d: `parseSystemDoc(raw, "strict")`, `normalizeSystemBlocks`, `serializeSystemDoc` (key-sorted, 2-space, trailing newline) in `src/features/system-pages/model/systemDoc.ts`; the limits (`maxDepth 12`, `maxBlocks 2000`, `maxBytes 524288`); `schema.generated.json`; and the fixpoint test.
- `vite.config.ts`: the plugins array, where a `{ name, apply: "serve", configureServer(server) { server.middlewares.use(…) } }` plugin goes. Nothing like it exists yet.
- The page menu (`usePageContextMenu` / the page header menu): where a dev-only item is added.

**OWNS:**
- `scripts/vite-system-doc-export.mjs` (new): the plugin factory and its pure request validator;
- `vite.config.ts`: one plugin entry. Preserve the 42 header;
- `src/features/system-pages/model/exportSystemDoc.ts` (new): page → `SystemDoc`, then POST;
- `src/features/system-pages/ui/ExportSystemDocDialog.tsx` (new): kind (`settings` only for now) and id, with a preview of the target path;
- one page-menu item, rendered only when `import.meta.env.DEV`;
- tests: `tests/canvas/system-doc-export.test.ts` (new), `tests/e2e/functional/systemDocExport.spec.mjs` (new).

**MUST NOT TOUCH:** `systemDoc.ts` (call it), any committed system document except through the export, the bridge, the production build config.

**Commit message:** `feat(system-pages): export a page as a system document from the dev server`

## Rules (each one is tested)

1. **Serve only.** The plugin has `apply: "serve"`. `npm run build` output contains no route path string and no reference to the plugin (`grep -r "__system-doc-export" build/` prints nothing). Paste that grep.
2. **Same origin, with a token.** At server start, the plugin creates a random 32-byte token. It hands the token to the page through a dev-only module (`virtual:system-doc-export-token`, resolved by the plugin). It accepts `POST /__system-doc-export` only when all three hold:
   - `Origin` equals the dev server's own origin;
   - `Content-Type` is `application/json`;
   - the `X-Export-Token` header equals the token, compared with `crypto.timingSafeEqual`.
   Anything else → 403, with nothing written. Test each refusal.
3. **Confined path.** `kind` must be in `["settings"]` and `id` must match `^[a-z][a-z0-9-]{0,63}$`. The target is `path.join(root, "src/system-docs", kind, id + ".json")`, then `fs.realpath` of its directory must still be inside `src/system-docs/`. A symlink pointing out → 403. Test `../`, an absolute id, an uppercase id, and a symlinked kind directory.
4. **Validated and canonical.**
   - The body is at most `maxBytes`; read it with a limit, and an oversized body → 413.
   - It passes `parseSystemDoc(body, "strict")`; failure → 422 with the errors.
   - The file written is exactly `serializeSystemDoc(doc)`, via a temporary file in the same directory plus `rename` (no torn file).
   - The response gives the path and the byte count.
   - Exporting the same page twice writes identical bytes (the fixpoint).
5. **Overwrite is explicit.** An existing file is replaced only when the request says `overwrite: true`; else 409. The dialog asks first, in the page, not with `confirm()`.
6. **The page side.** The export takes the page's blocks through `normalizeSystemBlocks`, drops runtime-only fields (`runtimeFields` in the schema), and shows the server's answer (path written, or each error). A `Caveat:` line in `exportSystemDoc.ts`: the token protects against other sites, not against code already running in the dev page.

## Steps

- [ ] **Step 1: Failing tests.** Canvas tests on the validator (rules 2–5, with a temp directory for the filesystem cases). An e2e on the dev server: author a heading + frame page, export it as `settings/sb-4g-demo`, read the file back through the dev server (`/src/system-docs/settings/sb-4g-demo.json?raw`) and compare it with `serializeSystemDoc` of the page. Remove the file at the end of the test.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the Origin check removed;
  - (b) the `realpath` check removed;
  - (c) the write is not canonical (`JSON.stringify(body)`).
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `npm run build` rc 0 plus the Rule 1 grep. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the build grep, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
