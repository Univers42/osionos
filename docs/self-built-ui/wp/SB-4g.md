# SB-4g — Dev authoring loop: "Export as system document" (self-built UI, phase S4) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §10 "Dev export"). A settings page is authored in the editor like any page, then exported into the repo as a canonical system document (`src/system-docs/<kind>/<id>.json`). This package adds the export: a page-menu item in dev, and a Vite middleware that exists only in `vite serve` and writes the file.

👹 because an HTTP request writes into the source tree. Any web page the developer opens can send a request to `localhost`, and the dev server is reachable from the LAN. So the middleware must refuse cross-site and network requests, and confine the path. Devil verdict D-SB-4g-spec (2026-10-26 01:11, kimi-k3): **BLOCK**. Its conditions are folded into the rules below, except the compose change: instead of re-binding the dev server, the token is a pairing code that no route serves (Rule 2). This needs a re-rule before dispatch.

Base: the integration tip with SB-1d merged.

## What exists (read these first)

- SB-1d: `parseSystemDoc(raw, "strict")`, `normalizeSystemBlocks`, `serializeSystemDoc` (key-sorted, 2-space, trailing newline) in `src/features/system-pages/model/systemDoc.ts`; the limits (`maxDepth 12`, `maxBlocks 2000`, `maxBytes 524288`); `schema.generated.json`; and the fixpoint test.
- `vite.config.ts`: the plugins array, where a `{ name, apply: "serve", configureServer(server) { server.middlewares.use(…) } }` plugin goes. Nothing like it exists yet.
- The page menu (`usePageContextMenu` / the page header menu): where a dev-only item is added.

**OWNS:**
- `scripts/vite-system-doc-export.mjs` (new): the plugin factory and its pure request validator;
- `.gitignore`: `target/system-doc-export.token` if `target/` is not already ignored;
- `vite.config.ts`: one plugin entry. Preserve the 42 header;
- `src/features/system-pages/model/exportSystemDoc.ts` (new): page → `SystemDoc`, then POST;
- `src/features/system-pages/ui/ExportSystemDocDialog.tsx` (new): kind (`settings` only for now) and id, with a preview of the target path;
- one page-menu item, rendered only when `import.meta.env.DEV`;
- tests: `tests/canvas/system-doc-export.test.ts` (new), `tests/e2e/functional/systemDocExport.spec.mjs` (new).

**MUST NOT TOUCH:** `systemDoc.ts` (call it), any committed system document except through the export, the bridge, the production build config.

**Commit message:** `feat(system-pages): export a page as a system document from the dev server`

## Rules (each one is tested)

1. **Serve only.** The plugin has `apply: "serve"` and only a `configureServer` hook, so neither `vite build` nor `vite preview` mounts it.
   - `grep -rE "system-doc-export|X-Export-Token" build/` prints nothing. Paste it.
   - With `npm run preview` up, `POST /__system-doc-export` → 404. Paste it.
2. **A pairing code, never served.** At server start the plugin creates a random 32-byte token. It prints it once in the dev-server log ("System-doc export code: …") and writes it to `target/system-doc-export.token` (gitignored, mode 0600). No module, route or HTML carries it. The developer pastes it into the export dialog once per server start; the dialog keeps it in `sessionStorage`.
   - Why not a virtual module: the dev server is published on every host interface (`docker-compose.dev.yml:13`, no host IP), and Vite's host check lets every IPv4-literal Host through. So any machine on the LAN can fetch any module the page can (D-SB-4g-spec).
   - Test: crawl the page HTML and every `/@id/` and `/src/` module the export dialog loads; none contains the token.
3. **Every request is checked before anything is read.** The route is matched exactly (`/__system-doc-export`, with the query stripped). Only `POST` passes; `OPTIONS`, `GET` and the rest → 403. The plugin never sends an `Access-Control-*` header. Each of these → 403, with nothing read or written:
   - `Origin` missing, `null`, several origins, or not in the allowlist. The allowlist is computed at server start: the scheme, then `localhost`, `127.0.0.1` and `[::1]`, plus the bound port read after `listening`. It is never derived from the request.
   - `Host` not in that same allowlist. The plugin runs before Vite's own host check, so it does its own.
   - `Content-Type` not `application/json`.
   - `X-Export-Token` wrong. Compare length first, then `crypto.timingSafeEqual`, so a wrong-length token is a 403, not a 500.
   Tests cover each refusal, and the e2e passes on its real origin `http://127.0.0.1:3004` (`playwright.config.ts:48,60`), so the allowlist is not hard-coded to `:3001`.
4. **Confined path.** `kind` must be in `["settings"]` and `id` must match `^[a-z][a-z0-9-]{0,63}$`.
   - First `mkdir -p` the kind directory, then `fs.realpath` both `src/system-docs` and the target directory. Containment is `path.relative(base, dir)`: it must not start with `..` and must not be absolute. A string-prefix check would accept `src/system-docs-evil`.
   - Tests: `../`, an absolute id, an uppercase id, a symlinked kind directory → 403. A symlink AT `<id>.json` is replaced by the rename, and its outside target stays byte-identical.
5. **Validated, canonical, atomic.**
   - The body cap is `maxBytes`, enforced by counting streamed bytes and destroying the socket past it; `Content-Length` is not trusted. An oversized body with an honest header, and an oversized chunked body with none, both → 413, nothing written.
   - The body passes `parseSystemDoc(body, "strict")`; failure → 422 with the errors.
   - The write is `serializeSystemDoc(doc)` to `<id>.json.<16 random bytes hex>.tmp` in the same directory, opened with flag `wx` (a symlink pre-placed at the temp name makes it fail, never follow), then `fs.rename`.
   - The new file is `chown`ed to the uid/gid of its parent directory, so a container running as root still leaves a file the host user owns (`stat -c '%u %g'` equals the directory's, tested).
   - The response gives the repo-relative path (never `/app/…`) and the byte count. No response or log line contains the token.
   - Exporting the same page twice writes identical bytes (the fixpoint).
6. **Overwrite is explicit.** An existing file is replaced only when the request says `overwrite: true`; else 409. The dialog asks first, in the page, not with `confirm()`.
7. **The page side.** The export takes the page's blocks through `normalizeSystemBlocks`, drops runtime-only fields (`runtimeFields` in the schema), and shows the server's answer (path written, or each error). A `Caveat:` line in the plugin: the pairing code and the Origin check stop other sites and other machines without the code, not code already running in the dev page or a person who can read the dev-server log.

## Steps

- [ ] **Step 1: Failing tests.** Canvas tests on the validator (rules 2–5, with a temp directory for the filesystem cases). An e2e on the dev server: author a heading + frame page, export it as `settings/sb-4g-demo`, read the file back through the dev server (`/src/system-docs/settings/sb-4g-demo.json?raw`) and compare it with `serializeSystemDoc` of the page. Remove the file at the end of the test.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the Origin check removed;
  - (b) the `realpath` check removed;
  - (c) the write is not canonical (`JSON.stringify(body)`);
  - (d) the allowlist is built from the request's `Host` header (a request with `Host: attacker.example`, `Origin: http://attacker.example:3001` and a valid token must still get 403);
  - (e) containment by string prefix instead of `path.relative`.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `npm run build` rc 0 plus the Rule 1 grep. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the build grep, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
