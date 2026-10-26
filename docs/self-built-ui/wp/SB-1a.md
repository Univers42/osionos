# SB-1a — BlockStyle: token scales, sanitizer, resolver, static CSS (self-built UI, phase S1)

Project: rebuild every settings section from the app's own blocks with today's exact look
(design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §3 and §11; plan:
`docs/superpowers/plans/2026-10-25-self-built-ui.md`). This package adds the typed style model that
every later block uses. No block reads it yet except through the tests; SB-1b is its first user.

**OWNS:** `src/entities/block/model/blockStyle.ts` (new), `src/app/styles/block-style.scss` (new), `tests/canvas/block-style.test.ts` (new), `src/entities/block/model/types.ts` (add `style?: BlockStyle` to `Block` only), and the ONE file that imports `recipes.css` (add the SCSS import next to it).
**MUST NOT TOUCH:** generated token files, `scripts/tokens/**`, any other style file, any renderer.

Rules that matter here:
- Every value maps to an EXISTING token (`--spacing`, `--osio-radius-*`, `--osio-fg-*`, `--osio-bg-*`, `--osio-block-tint-*-fg/bg`, `--osio-border-*`, `--osio-shadow-*`). Never add a token. If a scale value has no token, report it under `deviations:`. Do not invent a colour.
- The SCSS lives under `src/app/styles/`, so raw values are allowed there, but prefer tokens; `node scripts/check-token-refs.mjs` must still pass (every `--osio-*` you read must exist).
- `resolveBlockStyle` is on the render hot path: memoise by `block.style` identity in a `WeakMap` and allocate nothing on a cache hit.

**Commit message:** `feat(blocks): token-scaled BlockStyle with sanitizer, resolver and static CSS`

### Task 4: BlockStyle (SB-1a)

**Files:**
- Create: `src/entities/block/model/blockStyle.ts`, `src/app/styles/block-style.scss`, `tests/canvas/block-style.test.ts`
- Modify: `src/entities/block/model/types.ts` (`style?: BlockStyle` on `Block`); import the SCSS where `recipes.css` is imported.

**Interfaces:**
- Produces:
  - `STYLE_SCALES` (`as const`), with exactly these keys and values:
    - `tone`: default, primary, subtle, ghost, danger, danger-subtle, success, warning, accent;
    - `size`: sm, md, lg;
    - `text` and `surface`: default, muted, subtle, accent, danger, success, warning, plus gray, brown, orange, yellow, green, blue, purple, pink, red;
    - `border`: none, subtle, default, strong, danger, accent;
    - `borderSides`: all, top, bottom, x, y;
    - `radius`: none, sm, md, panel, lg, full;
    - `space`: 0–12;
    - `width`: hug, fill, fixed;
    - `align`: start, center, end, stretch;
    - `justify`: start, center, end, between;
    - `textSize`: xs, sm, base, lg, xl;
    - `weight`: regular, medium, semibold;
    - `shadow`: none, menu, panel.
  - `interface BlockStyle { tone?; size?; text?; surface?; border?; borderSides?; radius?; padding?; paddingX?; paddingY?; gap?; width?; fixedWidth?: Space; basis?: Space; align?; justify?; textSize?; weight?; shadow? }`, each typed from its scale.
  - `sanitizeBlockStyle(input: unknown): BlockStyle`
  - `resolveBlockStyle(block: Pick<Block, "style" | "textColor" | "backgroundColor">): Readonly<Record<string, string>>`. It returns `data-s-<key>` attributes, is memoised in a `WeakMap` by `block.style` identity, and `style` wins over the flat fields.

- [ ] **Step 1: Write the failing tests:**
  - `sanitizeBlockStyle({ padding: 3, radius: "panel", bogus: 1, gap: 99, tone: "neon" })` deep-equals `{ padding: 3, radius: "panel" }`
  - `sanitizeBlockStyle(null)`, `("x")`, `([])` each deep-equal `{}`
  - `resolveBlockStyle({ style: { padding: 3 } })` deep-equals `{ "data-s-padding": "3" }`
  - `resolveBlockStyle({ style: { text: "blue" }, textColor: "red" })["data-s-text"] === "blue"`; with only `textColor: "red"`, `"red"`
  - `const s = { gap: 2 }; resolveBlockStyle({ style: s }) === resolveBlockStyle({ style: s })`
  - SCSS coverage: compile `src/app/styles/block-style.scss` with `sass-embedded`'s `compile`, then assert that for every key and value in `STYLE_SCALES` the CSS contains the selector `[data-s-<key>="<value>"]`
- [ ] **Step 2: Run them to see them fail.** `npm run test:canvas -- tests/canvas/block-style.test.ts` → FAIL.
- [ ] **Step 3: Implement** `blockStyle.ts`, and `block-style.scss` with `@each` over the same value lists. Map them to existing tokens: `calc(var(--spacing) * n)`, `--osio-radius-*`, `--osio-fg-*`/`--osio-bg-*`, `--osio-block-tint-*-fg/bg`, `--osio-border-*`, `--osio-shadow-*`. A value with no token fails the coverage test; it does not get a new token.
- [ ] **Step 4: Run the tests and the gate.** Canvas test PASS; `npm run test:quality` rc 0 (the token checks included).
- [ ] **Step 5: Commit.** `git commit -m "feat(blocks): token-scaled BlockStyle with sanitizer, resolver and static CSS"`

