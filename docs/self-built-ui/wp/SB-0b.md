# SB-0b — Conformance ratchet (self-built UI, phase S0)

Project: rebuild every settings section from the app's own blocks (design:
`docs/superpowers/specs/2026-10-25-self-built-ui-design.md`). This package adds a gate that counts
hardcoded UI in `src/features/settings` and fails when the count moves without the ratchet file
moving with it. It changes NO product code.

**OWNS:** `scripts/check-built-with-blocks.sh` (new), `scripts/built-with-blocks.ratchet.json` (new), `tests/canvas/built-with-blocks-check.test.ts` (new), `scripts/docker-run.sh` (the `quality)` line only).
**MUST NOT TOUCH:** `src/**`, any other script, any other test.

**Commit message:** `build(quality): built-with-blocks ratchet over settings raw elements and token classes`

### Task 2: Conformance ratchet (SB-0b)

**Files:**
- Create: `scripts/check-built-with-blocks.sh`, `scripts/built-with-blocks.ratchet.json`, `tests/canvas/built-with-blocks-check.test.ts`
- Modify: `scripts/docker-run.sh:51` (append `&& bash scripts/check-built-with-blocks.sh` before the final `exec`)

**Interfaces:**
- Produces: `check-built-with-blocks.sh [dir=src/features/settings] [ratchet=scripts/built-with-blocks.ratchet.json] [--print]`. Exit 0 when every count equals the ratchet; exit 1 with `<key>: <count> > <allowed>` when a count rises, and `<key>: <count> < <allowed> — lower the ratchet` when one falls. Keys: `rawButton`, `rawInput`, `rawSelect`, `rawTextarea`, `rawTable`, `tokenClass` (`\[var\(--osio-`), counted over `*.tsx`. `--print` writes the current counts as JSON.

- [ ] **Step 1: Write the failing test** (`node:test`, spawns `bash` on a temp fixture dir):
  - `equal counts pass` → status 0, stdout contains `✓ built-with-blocks`
  - `one extra raw button fails` → status 1, stdout contains `rawButton: 2 > 1`
  - `one fewer token class asks to lower the ratchet` → status 1, stdout contains `tokenClass: 0 < 1 — lower the ratchet`
- [ ] **Step 2: Run it to see it fail.** Run: `npm run test:canvas -- tests/canvas/built-with-blocks-check.test.ts`. Expected: FAIL (script missing).
- [ ] **Step 3: Implement the script** with `grep -o … | wc -l` per key, plus `jq` or `node -e` for the JSON. Header `Caveat:`: it is a text match, so a `<button` inside a comment or a string counts (over-reports), and raw elements hidden behind a component outside the counted dir are not seen (by design: `@osionos/ui` owns them).
- [ ] **Step 4: Write the ratchet** with `--print` on the real tree (expected near: rawButton 54, rawInput 49, rawSelect 14, rawTable 3, tokenClass 620).
- [ ] **Step 5: Run the tests and the gate.** Run: `npm run test:canvas -- tests/canvas/built-with-blocks-check.test.ts` → PASS. Then `npm run test:quality` → rc 0, with the `✓ built-with-blocks` line present.
- [ ] **Step 6: Commit.** `git commit -m "build(quality): built-with-blocks ratchet over settings raw elements and token classes"`

