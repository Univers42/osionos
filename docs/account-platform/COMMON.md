# Rules for every work package (read before the spec below)

You implement ONE work package of the osionos account platform, in an isolated git worktree of
the osionos app (your current directory). Read `CLAUDE.md` first: it is the map of this repo.

## Scope
- Touch ONLY the files the spec lists under **OWNS**. Need anything else? Stop and report it in
  `deviations:`; do not edit it.
- Never edit: `src/shared/notion-database-sys/**`, `packages/**` (git submodules), generated token
  files (`*.generated.*`), `.env*`, `package.json`, `pnpm-lock.yaml`, git config — unless OWNS says so.

## Environment (Docker-first)
- There is no Node on the host. Never run `node`, `npm`, `pnpm`, `npx` directly.
- Run everything through the repo's Docker shim: `bash scripts/docker-run.sh <target>`
  (targets: `quality`, `typecheck`, `lint`, `test-bridge`, `test-canvas`, `test-e2e`, `build`).
- Never install, add or upgrade a dependency. Never push. Never use `git push`, `--force`,
  `git reset --hard`, or `git checkout` of other branches.

## Code
- Match the surrounding code: bridge `scripts/*.mjs` = ESM, **tabs**, Node built-ins only;
  `src/**` = TypeScript strict, existing idioms.
- Every new file starts with the 42 header block — copy the exact format from
  `scripts/bridge-realtime-socket.mjs` (By: dlesieur, Created/Updated: 2026/10/22 00:00:00).
- Comments explain WHY, never WHAT. Any heuristic, timeout, cache or limit carries a comment
  line starting `Caveat:` that names what it gets wrong.
- Files ≤ 300 lines, small functions, no dead code, no commented-out code, no `TODO`.
- Validate every input that crosses a trust boundary. Errors carry `status` and a stable `code`.

## Tests
- Write the tests first (they must fail before your code exists), in the project's framework:
  bridge → `node:test` + `node:assert/strict` in `tests/bridge/<name>.test.mjs`;
  app units → `tests/canvas/<name>.test.ts`; e2e → `tests/e2e/functional/<name>.spec.mjs`.
- Cover edge cases: empty, maximum, malformed, hostile input.

## Finish
1. Run every gate the spec lists. A gate you could not run is reported as not run — never as passed.
2. When all gates are green: `git add` only your files, then commit with the exact conventional
   message the spec gives. No `Co-Authored-By`, no "Generated with" trailer. Do not push.
3. End your final message with this block, exactly (one line each):

```text
status: done | partial | blocked
gates: <gate>=<exit code> ...
changed: <files>
deviations: <anything outside OWNS, or none>
next: <what is left, or none>
```
