# SB-1b — Block registry + the auto-layout `frame` block (self-built UI, phase S1) 👹

Project: rebuild every settings section from the app's own blocks (design §2 and §4; plan Task 5). This package adds the block registry that every new block type uses, and the first registered block, `frame` (Figma-style auto layout). It consumes SB-1a's `resolveBlockStyle` and `STYLE_SCALES` (merged before this package starts). The registry hook sits on the render hot path of every block: the existing perf cases must stay within budget.

**OWNS:** `src/entities/block/model/frameLayout.ts`, `src/entities/block/model/blockRegistry.ts`, `src/entities/block/registered/frame/FrameBlock.tsx`, `src/entities/block/registered/frame/FrameSettingsPopover.tsx`, `tests/canvas/frame-layout.test.ts`, `tests/e2e/functional/frameBlock.spec.mjs` (all new); `src/entities/block/model/types.ts` (`'frame'` in `BlockType`, `frame?: FrameConfig`); `src/entities/block/ui/ReadOnlyBlock.tsx` and `src/features/block-editor/ui/BlockEditor.tsx` (the registry lookup only, before each switch); `src/features/slash-commands/model/slashMenuCatalog.tsx` (append registry entries); `src/services/page-actions/pageMarkdownSerialize.ts`, `src/features/page-export/model/exportHtml.ts`, `src/features/page-export/model/exportPdfLines.ts` (registry exporter first); `src/app/styles/block-style.scss` (frame rules); `src/entities/block/model/blockCategories.ts` (the `frame` row); `src/features/page-file/model/pageFileCodec.ts` + `tests/canvas/page-file-codec.test.ts` (classify `frame`); `packages/markdown-engine/blockContract.ts` + `packages/markdown-engine/markdown/shortcuts.ts` (the `:::frame` container, a submodule commit); `tests/canvas/frame-markdown-roundtrip.test.ts` (new); `services/osionos-ai/src/tools/blockTypes.ts`, `scripts/osionos-mcp-server.mjs`, `src/widgets/agent-conversation/ui/AgentConversationPage.tsx` (`'frame'` in each allowlist only); `src/entities/page/model/usePageActions.ts` (`wordCountFromPage` only).
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


### Devil conditions (D-SB-1b-spec, 2026-10-25): these are acceptance criteria

Verdict PROCEED-WITH-CONDITIONS (blast 4, reversibility 3, cost 4, confidence 2). Each line below is part of "done".

1. **Category row.** `BLOCK_CATEGORIES` (`blockCategories.ts:113`, a `Record<BlockType, BlockCategory>`) gets `frame: { …, parentable: true, selfRendersChildren: true, enterCreatesChild: false, backspaceConvertsToParagraph: false }` (copy the remaining flags from `column`). Without `selfRendersChildren`, `BlockTree` (`BlockEditorSurface.tsx:1182-1215`) renders the children a second time outside the frame.
2. **Markdown round trip, lossless.** Raw mode and the `.omd` page file go through markdown, so a frame must survive it:
   - serialize (`pageMarkdownSerialize.ts`, next to the `:::columns` code at :33-49): `:::frame <JSON of block.frame>` … children … `:::`;
   - parse (`packages/markdown-engine/markdown/shortcuts.ts` `containerToBlocks`, :310-337): `node.kind === "frame"` → `{ type: "frame", content: "", frame: safeJsonRecord(node.params ?? "") ?? undefined, children }`. The engine passes the record through untouched; `frameAttrs` sanitizes at render, because pasted markdown is untrusted;
   - `'frame'` joins `MarkEngineBlockType` (`blockContract.ts:28`) and `frame?: Record<string, unknown>` joins `MarkEngineBlock`; the host guard (`MarkEngineBlockType extends BlockType`) must still compile;
   - `frame` goes in `MARKDOWN_KEYS` (`pageFileCodec.ts`), and the header comment table gets the row;
   - new test `tests/canvas/frame-markdown-roundtrip.test.ts`: a frame `{direction:"row", wrap:true, narrow:{below:720, direction:"column"}}` holding two paragraphs → serialize → `parseMarkdownToBlocks` → same type, same `frame` deep-equal, same two children contents. Also: a `:::frame not-json` container parses to a frame with no `frame` field and its children kept.
   - **Submodule:** commit inside `packages/markdown-engine` first, on a local branch `feat/sb-SB-1b` (never push), then commit the parent with the new gitlink. Report both SHAs.
3. **`style` classification is not yours.** SB-1a owns `style`; if the self-check at `page-file-codec.test.ts:190-199` names `style`, leave it, the reviewer resolves it at merge.
4. **Hot path.** The registry lookup is a `Map` built once at module load. It sits exactly after the `recordRef`/`fieldBind` check in `ReadOnlyBlock.tsx:188-197` and after `isProfileBound` in `BlockEditor.tsx:483-487`. `areReadOnlyBlockPropsEqual` (`ReadOnlyBlock.tsx:178-186`) is unchanged. Run `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash` and `longPage` and paste their p95 lines against `BUDGET` (:49-52).
5. **Children are fully editable.** `FrameBlock.Edit` renders its children only through the passed `renderChildren()`: focus, Enter, Backspace, slash, drag and block selection all work inside it. The e2e proves Enter inside a frame child creates a sibling inside the frame, not after it. `FrameBlock.View` renders children through `ReadOnlyBlock`.
6. **Container queries don't break sizing.** The `container-type: inline-size` wrapper carries `min-width: 0; width: 100%`. The 375 px e2e with a 120-character unbroken word has no horizontal scroll (already Step 2), and a frame inside a `layout` canvas cell keeps its measured auto height (add one e2e case: the cell height is above 0 and the frame is fully visible).
7. **Slash entries.** Ids are `block:${def.type}`; `section` is one of `SECTION_ORDER` (`slashMenuCatalog.tsx:103-113`). `filterSlashCommands`, `groupSlashCommands` and `isSlashCommandAvailable` (`slashAvailability.ts:9-11`) keep passing their tests; `/frame` is found by its aliases.
8. **Allowlists.** `'frame'` joins `services/osionos-ai/src/tools/blockTypes.ts:9-45`, the block-type list in `scripts/osionos-mcp-server.mjs` (~:28-57) and `AgentConversationPage.tsx:81-108`.
9. **Word count.** `wordCountFromPage` (`usePageActions.ts:95-97`) walks children recursively, so text inside a frame counts. One canvas assertion on a frame holding a 3-word paragraph proves it.
