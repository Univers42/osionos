# SB-1b — Block registry + the auto-layout `frame` block (self-built UI, phase S1) 👹

Project: rebuild every settings section from the app's own blocks (design §2 and §4; plan Task 5). This package adds the block registry that every new block type uses, and the first registered block, `frame` (Figma-style auto layout). It consumes SB-1a's `resolveBlockStyle` and `STYLE_SCALES` (merged before this package starts). The registry hook sits on the render hot path of every block: the existing perf cases must stay within budget.

**OWNS:** `src/entities/block/model/frameLayout.ts`, `src/entities/block/model/blockRegistry.ts`, `src/entities/block/registered/frame/FrameBlock.tsx`, `src/entities/block/registered/frame/FrameSettingsPopover.tsx`, `tests/canvas/frame-layout.test.ts`, `tests/e2e/functional/frameBlock.spec.mjs` (all new); `src/entities/block/model/types.ts` (`'frame'` in `BlockType`, `frame?: FrameConfig`); `src/entities/block/ui/ReadOnlyBlock.tsx` and `src/features/block-editor/ui/BlockEditor.tsx` (the registry lookup only, before each switch); `src/features/slash-commands/model/slashMenuCatalog.tsx` (append registry entries); `src/services/page-actions/pageMarkdownSerialize.ts`, `src/features/page-export/model/exportHtml.ts`, `src/features/page-export/model/exportPdfLines.ts` (registry exporter first); `src/app/styles/block-style.scss` (frame rules).
**MUST NOT TOUCH:** any existing case of the renderer switches, any other block's behaviour, `usePlaygroundBlockEditor.ts`.

**Commit message:** `feat(blocks): block registry and the auto-layout frame block`

### Task 5: Block registry + `frame` (SB-1b 👹)

**Files:**
- Create: `src/entities/block/model/frameLayout.ts`, `src/entities/block/model/blockRegistry.ts`, `src/entities/block/registered/frame/FrameBlock.tsx`, `src/entities/block/registered/frame/FrameSettingsPopover.tsx`, `tests/canvas/frame-layout.test.ts`, `tests/e2e/functional/frameBlock.spec.mjs`
- Modify: `types.ts` (`'frame'` in `BlockType`, `frame?: FrameConfig`); `ReadOnlyBlock.tsx:188-197`; `BlockEditor.tsx:483-487`; `slashMenuCatalog.tsx:387`; the three exporters; `block-style.scss` (frame rules).

**Interfaces:**
- Consumes: `resolveBlockStyle` (Task 4).
- Produces:
  - `FRAME_BREAKPOINTS = [480, 720, 1024] as const`
  - `interface FrameConfig { direction: "row" | "column"; wrap?: boolean; dividers?: boolean; narrow?: { below: 480 | 720 | 1024; direction?: "row" | "column"; hide?: boolean } }`
  - `frameAttrs(frame: unknown): Readonly<Record<string, string>>`
  - `interface BlockDefinition { type: BlockType; label: string; slash?: { aliases: string[]; description: string; section: string; icon: () => React.ReactNode }; create(): Partial<Block>; View: React.ComponentType<{ block: Block; mode: "live" | "preview" }>; Edit: React.ComponentType<{ block: Block; pageId: string; onUpdate(updates: Partial<Block>): void; renderChildren(): React.ReactNode }>; toMarkdown?(block: Block, children: string): string; toHtml?(block: Block, children: string): string }`
  - `getBlockDefinition(type: string): BlockDefinition | undefined`
  - `REGISTERED_BLOCKS: readonly BlockDefinition[]`

- [ ] **Step 1: Write the failing unit test** (`frame-layout.test.ts`):
  - `frameAttrs({ direction: "row", wrap: true, dividers: true, narrow: { below: 720, direction: "column" } })` deep-equals `{ "data-frame": "", "data-frame-dir": "row", "data-frame-wrap": "", "data-frame-dividers": "", "data-frame-narrow-below": "720", "data-frame-narrow-dir": "column" }`
  - `frameAttrs({ direction: "row", narrow: { below: 600, direction: "column" } })` has no `data-frame-narrow-*` key
  - `frameAttrs(undefined)` deep-equals `{ "data-frame": "", "data-frame-dir": "column" }`
- [ ] **Step 2: Write the failing e2e** (`frameBlock.spec.mjs`, offline build):
  - typing `/frame` + Enter on a page inserts `[data-frame]`, and two paragraphs typed inside are its children;
  - the popover sets direction row: `getComputedStyle(frame).flexDirection === "row"`;
  - with the narrow rule `below 720 → column`, after `page.setViewportSize({ width: 375, height: 812 })` the frame's `flexDirection === "column"`;
  - with a 120-character unbroken word in a row frame at 375 px, `document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth` (Review Focus 2);
  - after locking the page (View), the frame and its children render through `ReadOnlyBlock` with the same `flexDirection`.
- [ ] **Step 3: Run both and see them fail.** `npm run test:canvas -- tests/canvas/frame-layout.test.ts`, then `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/frameBlock.spec.mjs` → FAIL.
- [ ] **Step 4: Implement `frameLayout.ts` and `blockRegistry.ts`.** The registry is a static array (no runtime `register`). The lookup is a `Map` built once.
- [ ] **Step 5: Implement `FrameBlock.tsx`.**
  - The outer element carries `frameAttrs` + `resolveBlockStyle`.
  - Children render through `ReadOnlyBlock` in View and `renderChildren()` in Edit (dependency inversion: entities never import features).
  - With a `narrow` rule, a wrapper gets `container-type: inline-size`. Caveat in the file: a frame with a narrow rule must be `width: fill`, because the wrapper has no intrinsic width.
- [ ] **Step 6: Hook the registry into the renderers, slash menu and exporters.**
  - In `ReadOnlyBlock`, after the bound-field check: `const def = getBlockDefinition(block.type); if (def) return <def.View block={block} mode="live" />;` (SB-6a replaces the constant with the render-mode context).
  - In `BlockEditor`, after `isProfileBound`, the same with `def.Edit`, `onUpdate` mapped to `commitBlockUpdate(block.id, …)` and the existing `renderChildren`.
  - `SLASH_COMMANDS` appends `{ kind: "block", id: \`block:${def.type}\`, label, aliases, description, section, icon: def.slash.icon(), blockType: def.type }` for each definition with `slash`.
  - Each exporter calls `def.toMarkdown` / `def.toHtml` before its switch, and joins the children by default.
- [ ] **Step 7: Add the frame rules to `block-style.scss`:**
  - `[data-frame]{display:flex}`
  - `[data-frame-dir=…]` (direction)
  - `[data-frame-wrap]{flex-wrap:wrap}`
  - dividers: `> * + *` with border-top (column) or border-left (row), `var(--osio-border-default)`
  - children: `min-width:0; overflow-wrap:anywhere`
  - one `@container (max-width: <below-1>px)` block per breakpoint
- [ ] **Step 8: Run everything.** Unit PASS; e2e `5 passed`; `npm run test:quality` rc 0; the existing `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash`, `longPage` stay within `BUDGET` (the registry lookup sits on the hot path).
- [ ] **Step 9: Commit.** `git commit -m "feat(blocks): block registry and the auto-layout frame block"`

