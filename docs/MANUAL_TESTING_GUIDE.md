# Block Editor — Manual Testing Guide

**Purpose:** Shared reference for verifying block editor behavior after any change.
**Usage:** Run the relevant sections after modifying editor files. Run all sections before merging to develop.
**Last updated:** April 2026

---

## How to use this document

Each test has a priority level:

- **P0 — Critical:** Must pass before any merge. Failure means broken core functionality.
- **P1 — Important:** Must pass before merging features that touch the relevant area.
- **P2 — Edge case:** Should pass. Failure indicates a minor issue that can be tracked.

Format: `[Priority] Description → Action → Expected result`

---

## 1. Block Creation & Type Selection

### Slash menu

- [P0] **Slash menu opens on `/`** → Type `/` in an empty paragraph → Slash menu appears below the cursor with block type options.
- [P0] **Slash menu filters on typing** → Type `/hea` → Only heading options are visible in the menu.
- [P0] **Slash menu selection with Enter** → Type `/quote`, press Enter on the highlighted option → Block converts to quote. The `/quote` text is cleaned. No extra paragraph is created below.
- [P0] **Slash menu selection with click** → Type `/`, click on "Bulleted List" → Block converts to bulleted list. The `/` text is cleaned.
- [P0] **Slash menu keyboard scroll** → Type `/`, press ArrowDown repeatedly past the visible area → The active item scrolls into view automatically. The selected item is always visible.
- [P1] **Slash menu closes on Escape** → Type `/`, press Escape → Menu closes, `/` remains in the text as typed content.
- [P1] **Slash menu closes on backspace past `/`** → Type `/he`, backspace 3 times (removing `h`, `e`, `/`) → Menu closes when `/` is deleted.
- [P2] **Slash menu reopens after previous use** → Create a block via slash menu, move to a new paragraph, type `/` again → Menu opens normally.

### Markdown shortcuts

- [P0] **Heading shortcut** → Type `# ` (hash + space) in an empty paragraph → Converts to heading_1. The `# ` prefix is removed.
- [P0] **Bulleted list shortcut** → Type `- ` (dash + space) → Converts to bulleted_list.
- [P0] **Numbered list shortcut** → Type `1. ` → Converts to numbered_list.
- [P1] **Code fence shortcut** → Type ` ``` ` or ` ```typescript ` → Converts to code block with the specified language.
- [P1] **Divider shortcut** → Type `---` → Converts to divider.
- [P1] **Todo shortcut** → Type `[] ` or markdown todo syntax → Converts to to_do block.

---

## 2. Indentation (Tab / Shift+Tab)

### Basic indentation

- [P0] **Tab indents paragraph under previous sibling** → Create paragraphs A, B. Cursor in B, press Tab → B appears indented under A.
- [P0] **Shift+Tab outdents** → With B indented under A, cursor in B, press Shift+Tab → B returns to root level.
- [P0] **Tab on first block does nothing** → Create a single paragraph, press Tab → Nothing happens (no previous sibling to nest into).
- [P0] **Shift+Tab at root does nothing** → Cursor in a root-level paragraph, press Shift+Tab → Nothing happens.

### Type-specific indentation

- [P0] **Heading indents under paragraph** → Create paragraph A, heading B below. Tab on B → B indents under A, keeps heading style.
- [P0] **Cannot indent under a heading** → Create heading A, paragraph B below. Tab on B → Nothing happens (headings are NON_PARENTABLE).
- [P0] **Cannot indent under code block** → Create code block A, paragraph B below. Tab on B → Nothing happens.
- [P0] **Cannot indent under divider** → Create divider, paragraph below. Tab on paragraph → Nothing happens.
- [P1] **Can indent under callout** → Create callout A, paragraph B below. Tab on B → B appears inside the callout's colored box.
- [P1] **Can indent under quote** → Create quote A, paragraph B below. Tab on B → B appears inside the quote's left border.
- [P1] **Code block Tab inserts spaces** → Cursor inside a code block textarea, press Tab → 4 spaces inserted (not block-level indent).

### Multi-level indentation

- [P0] **Two levels deep** → Create A, B, C. Tab on B (child of A). Tab on C (child of A, sibling of B). Tab on C again (child of B, grandchild of A) → Two visible indentation levels. C is further right than B.
- [P0] **Outdent one level at a time** → With A → B → C nested. Shift+Tab on C → C becomes sibling of B. Shift+Tab on C again → C returns to root.
- [P1] **Single Tab from root goes one level** → Create A (with child B), then C at root. Tab on C → C becomes sibling of B (child of A), NOT child of B. Second Tab on C → C becomes child of B.

---

## 3. Enter Key Behavior

### Standard blocks

- [P0] **Enter in paragraph creates new paragraph** → Type text in a paragraph, press Enter → New empty paragraph appears below, cursor moves to it.
- [P0] **Enter in heading creates paragraph** → Type in a heading, press Enter → New paragraph (not heading) appears below.
- [P0] **Enter in code block creates newline** → Press Enter inside code textarea → Newline inserted in the code. No new block created.
- [P0] **Enter on divider creates new paragraph below** → Focus a divider, press Enter → New paragraph appears below the divider.

### List continuation

- [P0] **Enter in bulleted list creates new bullet** → Type in a bulleted_list item, press Enter → New bulleted_list item appears below.
- [P0] **Enter in numbered list creates new number** → Type in a numbered_list item, press Enter → New numbered_list item with next number.
- [P0] **Enter in to_do creates new to_do** → Type in a to_do item, press Enter → New unchecked to_do appears below.
- [P0] **Enter in empty list item converts to paragraph** → Create a bulleted_list, press Enter on empty item → Converts to paragraph.
- [P0] **Enter in empty to_do converts to paragraph** → Press Enter on empty to_do → Converts to paragraph, checked state cleared.

### Container blocks (Enter creates child inside)

- [P0] **Enter in callout creates child inside** → Type in a callout, press Enter → New paragraph appears inside the callout's colored box (not below it).
- [P0] **Enter in quote creates child inside** → Type in a quote, press Enter → New paragraph appears inside the quote's left border.
- [P0] **Enter in toggle summary expands and creates child** → Type in a toggle summary, press Enter → Toggle expands, new paragraph child appears inside.

---

## 4. Arrow Navigation

### Standard navigation

- [P0] **ArrowDown at end of block jumps to next block** → Place cursor at the end of a paragraph's text, press ArrowDown → Cursor moves to the start of the next block.
- [P0] **ArrowUp at start of block jumps to previous block** → Place cursor at the start of a paragraph's text, press ArrowUp → Cursor moves to the end of the previous block.
- [P0] **ArrowDown in middle of text does not jump** → Place cursor in the middle of text, press ArrowDown → Cursor moves down within the text (browser default), does not jump to next block.

### Navigation through non-text blocks

- [P0] **Arrow through divider** → Paragraph above, divider, paragraph below. ArrowDown from end of top paragraph → Focus lands on divider → ArrowDown again → Focus moves to bottom paragraph.
- [P0] **Arrow through code block** → Paragraph above, code block with content, paragraph below. ArrowDown from end of top paragraph → Cursor enters code block textarea at the start. ArrowDown navigates lines within the textarea. ArrowDown at last line of textarea → Focus moves to bottom paragraph.
- [P0] **ArrowUp exits code block** → Cursor at the first character of code textarea, press ArrowUp → Focus moves to previous block.
- [P1] **Arrow through database block** → ArrowDown from paragraph above a database → Focus skips over database to the next block below it.
- [P0] Arrow through table block → Paragraph above, table block, paragraph below. ArrowDown from end of top paragraph → Focus enters first cell of table. ArrowDown from table wrapper → Focus moves to bottom paragraph.

### Navigation does not interfere with block-internal editing

- [P0] Typing in table cells preserves cursor → Click a table cell, type multiple characters → All characters appear in the cell without cursor loss. No need to re-click between keystrokes.
- [P1] Typing in code block preserves cursor → Click inside code textarea, type multiple lines → Characters and newlines appear normally without jumping.

### Smooth scrolling

- [P0] **Navigation scrolls smoothly** → Navigate with arrow keys through many blocks until past the viewport edge → Page scrolls smoothly to keep the focused block visible. No abrupt jumps.
- [P0] **No scroll when block is already visible** → Navigate between two adjacent visible blocks → No scroll movement occurs.

---

## 5. Backspace / Delete Behavior

### Empty block deletion

- [P0] **Backspace on empty paragraph (root) deletes it** → Create two paragraphs, empty the second, press Backspace → Second paragraph deleted, focus moves to first.
- [P0] **Backspace on empty heading converts to paragraph** → Create a heading, clear its text, press Backspace → Converts to paragraph (not deleted).
- [P0] **Backspace on empty list item deletes it** → Create a bulleted_list item, clear it, press Backspace → Item deleted, focus moves to adjacent block.

### Parent-child deletion

- [P0] **Backspace on empty parent promotes children** → Create paragraph A with children B, C. Clear A, press Backspace → A disappears. B and C move up to A's former level.
- [P0] **Promotion preserves multi-level nesting** → Create A → B → C (three levels). Clear A, press Backspace → B (with its child C) promotes to root. C remains child of B.
- [P1] **Backspace on empty indented paragraph outdents** → Indent paragraph B under A. Clear B, press Backspace → B outdents to A's level (not deleted).

### Divider deletion

- [P1] **Backspace or Delete on focused divider removes it** → Focus a divider block, press Backspace or Delete → Divider removed, focus moves to adjacent block.

---

## 6. Context Menu

### Basic operations

- [P0] **Context menu opens on right-click** → Right-click a block → Context menu appears with Insert, Move, Turn into, Actions, Delete sections.
- [P0] **Context menu opens on drag handle click** → Click the 6-dot drag handle → Context menu appears.
- [P0] **Delete from context menu removes entire subtree** → Create A with children B, C. Right-click A → Delete → A, B, and C all disappear.
- [P1] **Insert above/below** → Right-click a block → "Insert text above" → New paragraph appears above the block.
- [P1] **Duplicate** → Right-click a block with content → Duplicate → Identical block appears below.
- [P1] **Move up/down** → Right-click a block between two others → Move up → Block swaps with the one above.
- [P1] **Turn into** → Right-click a paragraph → Turn into → Heading 1 → Block becomes heading_1 with same content.
- [P2] **Copy text** → Right-click a block with content → Copy text → Content is in clipboard.

### Context menu + children

- [P0] **Delete parent from menu removes all children** → A with children B, C. Delete A from context menu → A, B, C gone. Focus moves to next or previous block.
- [P1] **Delete leaf block from menu** → Delete a block with no children → Only that block removed.
- [P2] **Duplicate parent duplicates subtree** → A with child B. Duplicate A → New A' with child B' appears below. Both are independent copies.

---

## 7. Drag and Drop

### Same-level reorder

- [P0] **Reorder siblings** → Create A, B, C at root. Drag C above A → Order: C, A, B.
- [P0] **Reorder within nested children** → A has children B, C, D. Drag D above B → A's children: D, B, C.

### Cross-level moves

- [P0] **Drag child to root** → A has child B. Drag B below A at root level → A (no children), B at root.
- [P0] **Drag between parent groups** → A has children B, C. D has children E, F. Drag B below E inside D → A has child C. D has children E, B, F.
- [P1] **Drag block maintains its children** → A has child B. B has child C. Drag A to a new position → A, B, C hierarchy preserved.

### Safety checks

- [P0] **Cannot drop block on itself** → Drag A, drop on A → Nothing happens.
- [P1] **Visual drop indicator shows** → While dragging over a block → Blue line appears above or below the target block.
- [P2] **Dragged block appears transparent** → While dragging → Original block position shows at reduced opacity.

---

## 8. Toggle Block

### Basic toggle behavior

- [P0] **Expand/collapse with chevron** → Click chevron on a toggle → Children appear/disappear.
- [P0] **Enter on toggle summary creates child** → Type in toggle, press Enter → Toggle expands, new paragraph child inside.
- [P0] **Empty toggle shows hint** → Expand a toggle with no children → "Empty toggle" text appears in grey.

### Toggle children as full blocks

- [P0] **Slash menu works in toggle children** → Inside a toggle child, type `/` → Slash menu appears.
- [P0] **Markdown shortcuts work in toggle children** → Inside a toggle child, type `- ` → Converts to bulleted_list inside the toggle.
- [P1] **Indent within toggle** → Toggle has children A, B. Tab on B → B indents under A inside the toggle.
- [P1] **Collapsed toggle preserves children** → Add children, collapse toggle, expand → Children intact.

### Toggle + external interactions

- [P1] **Indent block under collapsed toggle** → Create toggle (collapsed) and paragraph below. Tab on paragraph → Paragraph moves into toggle's children (disappears visually). Expand toggle → Paragraph visible as child.
- [P1] **Delete toggle promotes children** → Toggle with children A, B. Clear toggle summary, Backspace → A and B promote to root.
- [P1] **Delete toggle from context menu removes all** → Toggle with children. Right-click toggle → Delete → Toggle and all children gone.

---

## 9. Callout & Quote as Containers

### Callout

- [P0] **Enter in callout creates child inside box** → Type in callout, Enter → New paragraph inside the colored box, aligned with text (right of icon).
- [P0] **Children render inside callout visually** → Indent a block under callout → Block appears inside the colored background.
- [P1] **Slash menu works inside callout children** → In a callout child, type `/` → Slash menu works.
- [P1] **Delete callout promotes children** → Callout with children. Backspace on empty callout → Children promote to callout's level.
- [P1] **Delete callout from context menu removes all** → Callout with children. Right-click callout → Delete → Callout and children gone.

### Quote

- [P0] **Enter in quote creates child inside border** → Type in quote, Enter → New paragraph inside the left border.
- [P0] **Children render inside quote visually** → Indent a block under quote → Block appears inside the left border decoration.
- [P1] **Multiple children inside quote** → Create quote with 3 children → All render inside the left border, properly indented.
- [P1] **Delete quote promotes children** → Quote with children. Backspace on empty quote → Children promote.
- [P1] **Delete quote from context menu removes all** → Quote with children. Right-click quote → Delete → Quote and children gone.

---

## 10. Read-Only Rendering

- [P0] **All block types render correctly** → Open a page with diverse block types in read-only mode → Every type displays with correct styling.
- [P0] **Nested children render in read-only** → Page with indented blocks → Children appear indented correctly.
- [P0] **Callout children inside colored box** → Read-only callout with children → Children visible inside the box.
- [P0] **Quote children inside left border** → Read-only quote with children → Children visible inside the border.
- [P0] **Toggle expand/collapse in read-only** → Click toggle chevron → Children show/hide.
- [P1] **Numbered list counter resets per context** → Nested numbered lists → Each nesting level starts counting from 1.

---

## 11. Paste Handling

- [P1] **Paste markdown creates multiple blocks** → Copy multi-line markdown (e.g., heading + paragraph + list), paste into editor → Creates corresponding block types.
- [P1] **Paste code fence creates code block** → Paste text with ` ``` ` fences → Creates code block with content.
- [P2] **Paste single line stays as inline text** → Paste a single short sentence → Inserts as text in current block (no new block created).

---

## 12. Inline Text Selection & Formatting Toolbar

### Toolbar visibility

- [P0] **Toolbar appears on non-collapsed text selection** → Select text inside a paragraph, heading, quote, callout, list item, toggle summary, or media caption → Inline toolbar appears above the selection.
- [P0] **Toolbar does not appear on collapsed selection** → Click inside editable text without selecting characters → Inline toolbar does not appear.
- [P0] **Toolbar closes when selection is cleared** → Select text so the toolbar appears, then click elsewhere in the same block → Toolbar disappears.
- [P1] **Toolbar closes on blur** → Select text, then click outside the editor → Toolbar disappears and no floating inline controls remain visible.
- [P1] **Toolbar is not used inside code block textarea** → Select text inside a code block textarea → Native textarea selection appears. Inline toolbar does not appear.

### Color actions

- [P0] **Text color button opens palette** → Select text, click `A` in the toolbar → Text color palette opens below the toolbar.
- [P0] **Background color button opens palette** → Select text, click `▣` in the toolbar → Background color palette opens below the toolbar.
- [P0] **Applying text color updates only the selected text** → Select one word, choose a text color → Only the selected word changes text color.
- [P0] **Applying background color updates only the selected text** → Select one word, choose a background color → Only the selected word receives the highlight/background.
- [P0] **Text color survives additional typing** → Apply text color to a selection, place the caret inside that colored text, type several characters → Newly typed characters stay inside the same colored span. Color does not stack or intensify.
- [P0] **Background color survives additional typing** → Apply background color to a selection, place the caret inside that highlighted text, type several characters → Newly typed characters stay inside the same background span. Background does not stack or intensify.
- [P0] **Text color and background color can coexist with other formats** → Apply bold + italic + text color + background color to the same selection, then type inside it → All formats remain active together without visual duplication or slowdown.
- [P1] **Applying the same text color again removes that text color** → Select text that already has a uniform text color, reopen the text color palette, choose the same color → Text color wrapper is removed and text returns to inherited/default color.
- [P1] **Applying the same background color again removes that background color** → Select text that already has a uniform background color, reopen the background color palette, choose the same color → Background wrapper is removed and text returns to inherited/default background.
- [P1] **Background color excludes trailing whitespace** → Select a word plus the following space, apply background color → The word is highlighted, but the trailing space is not.

### Format actions

- [P0] **Bold button toggles bold on selection** → Select text, click `B` → Selection becomes bold. Click `B` again on the same fully bold selection → Bold is removed.
- [P0] **Italic button toggles italic on selection** → Select text, click `I` → Selection becomes italic. Click `I` again on the same fully italic selection → Italic is removed.
- [P0] **Strikethrough button toggles strikethrough on selection** → Select text, click `S` → Selection becomes strikethrough. Click `S` again on the same fully struck selection → Strikethrough is removed.
- [P0] **Inline code button wraps the selection as inline code** → Select text, click `</>` → Selection is rendered as inline code.
- [P1] **Inline code keeps inherited custom colors** → Select text with custom text color and background color plus additional wrappers (e.g. bold), click `</>` → Inline code renders with the same custom code text/background colors instead of the default code background.
- [P1] **Mixed formats persist after subsequent edits** → Apply multiple formats to part of a line, continue typing in the same formatted region, then delete characters → Wrappers remain stable and formatting is preserved instead of multiplying.

### Link and slash actions

- [P0] **Add link opens link type chooser** → Select text, click `↗` → Link chooser opens with `Web link` and `Page link`.
- [P0] **External link can be applied** → Select text, click `↗`, choose `Web link`, enter a URL, submit → Selected text becomes a link to that URL.
- [P0] **Internal page link can be applied** → Select text, click `↗`, choose `Page link`, search for a visible page, click it → Selected text becomes an internal page link.
- [P1] **Page link search filters results** → Open `Page link`, type part of a page title → Matching pages remain visible, non-matching pages disappear.
- [P1] **No-result state is shown for page link search** → Open `Page link`, search for a non-existent title → `No pages match your search.` is displayed.
- [P1] **Cancel or Escape closes the link picker** → Open either link picker mode, click `Cancel` or press Escape → Picker closes without changing the selection.
- [P1] **Slash button opens slash menu from the selection** → Select text, click `/` in the toolbar → Slash menu opens near the selection and the floating toolbar closes.

---

## 13. Emojis, Icons & Media

### Page icons

- [P0] **Add icon assigns a page icon when none exists** → Open a page without an icon, click `Add icon` in the page toolbar → A random page icon is assigned and displayed above the title.
- [P0] **Clicking the page icon opens the picker** → Open a page with an icon, click the large icon → Emoji/icon/media picker opens below the icon.
- [P0] **Selecting an asset updates the page icon** → In the page icon picker, choose an emoji, icon, or supported asset → Page icon updates immediately.
- [P1] **Remove icon clears the page icon** → Open the page icon picker, click `Remove icon` → Icon disappears and the `Add icon` button becomes visible again.
- [P1] **Page icon picker closes on outside click or Escape** → Open the page icon picker, click outside or press Escape → Picker closes.

### Callout icons

- [P0] **Clicking a callout icon opens the picker** → Create a callout block, click its icon → Picker opens next to the callout icon.
- [P0] **Selecting an asset updates the callout icon** → In the callout icon picker, choose a new emoji/icon → Callout icon updates immediately.
- [P1] **Remove icon resets callout to default icon** → Open the callout icon picker, click `Remove icon` → Callout icon resets to the default `💡` instead of becoming empty.
- [P1] **Callout icon picker closes on outside click or Escape** → Open the callout icon picker, click outside or press Escape → Picker closes.

### Page cover

- [P0] **Add cover assigns a cover when none exists** → Open a page without a cover, click `Add cover` → A random cover appears at the top of the page.
- [P0] **Change cover opens the cover picker** → On a page with a cover, click `Change cover` → Cover picker opens below the cover controls.
- [P0] **Selecting a cover updates the page cover** → In the cover picker, choose a gradient or media cover → Page cover updates immediately.
- [P1] **Remove cover clears the cover** → On a page with a cover, click the trash/remove cover control → Cover disappears and `Add cover` becomes visible again.
- [P1] **Cover picker closes on outside click or Escape** → Open the cover picker, click outside or press Escape → Picker closes.

### Media blocks

- [P0] **Slash menu can create image/video/audio/file blocks** → Type `/image`, `/video`, `/audio`, or `/file`, then select a library asset → Corresponding media block is created.
- [P0] **Selecting media on an empty paragraph converts the current block** → In an empty paragraph, open the slash menu media picker and choose an asset → Current block becomes the selected media block type with that asset.
- [P0] **Selecting media when the current paragraph already has text inserts a new media block** → In a paragraph with typed text, open the slash menu media picker and choose an asset → Original paragraph text remains and a new media block is inserted below.
- [P0] **Media block preview matches type** → Create one block of each media type with a valid asset → Image shows inline image preview, video shows a player/poster, audio shows an audio player, file shows an openable file card.
- [P0] **Change media asset updates the preview** → In an existing media block, click `Change image/video/audio/file`, pick a different asset → Preview updates immediately without changing block type.
- [P1] **Empty media block shows placeholder** → Create a media block without selecting an asset or remove its asset from state/dev tools → Placeholder prompt such as `Select a ...` is shown.
- [P1] **Media picker closes on outside click or Escape** → Open `Change image/video/audio/file`, click outside or press Escape → Picker closes.
- [P1] **Media block caption is editable inline** → Add text to the caption area under a media block → Caption is stored as inline editable text and supports the standard text selection toolbar.

---

## 14. Block Category Registry Compliance

These tests verify that the registry (`blockCategories.ts`) is correctly wired:

### NON_INDENTABLE types (Tab does nothing)

- [P1] **Code block** → Tab inside code → Inserts spaces, not block indent.
- [P1] **Divider** → Focus divider with click → Tab does not indent.
- [P1] **Database inline** → Tab does nothing.

### NON_PARENTABLE types (cannot receive children via indent)

- [P1] **Headings (h1-h6)** → Tab on a block below a heading → Nothing happens.
- [P1] **Code, divider, table, database, media** → Tab on a block below any of these → Nothing happens.

### enterCreatesChild types (Enter creates child inside)

- [P1] **Toggle** → Enter on summary → Child created inside (handled by ToggleBlockEditor).
- [P1] **Callout** → Enter → Child inside colored box.
- [P1] **Quote** → Enter → Child inside left border.
- [P1] **Paragraph, headings, lists** → Enter → Sibling created (not child).

---

## 15. Page Permissions (ABAC)

### Private / Shared page movement

- [P0] **Owner can move own page to Private** → User A creates a page in Shared → User A moves it to their Private workspace → Page moves successfully, only User A has access.
- [P0] **Non-owner cannot move shared page to their Private** → User A creates a page, moves to Shared → Switch to User B → User B opens Move modal → User B's private workspace is not listed as a destination.
- [P0] **Non-owner can duplicate shared page** → User A creates a page in Shared → User B duplicates it → Copy appears in User B's private workspace with User B as owner. Original stays in Shared.
- [P1] **canMovePage blocks unauthorized moves** → Attempt to call movePage programmatically for a non-owned page to a private workspace → Operation is rejected by canMovePage guard.

### Page visibility

- [P0] **Private pages only visible to owner** → User A creates a private page → Switch to User B → Page does not appear in User B's sidebar or search.
- [P0] **Shared pages visible to all workspace members** → User A creates a page in the shared workspace → Switch to User B → Page is visible and editable.
- [P1] **Moving page to Shared updates visibility** → User A has a private page, moves to Shared workspace → Visibility updates to 'shared', page appears for all members.

---

## 16. Cross-Cutting Concerns

### Focus management

- [P0] **Focus moves to new block after Enter** → Press Enter → Cursor is in the new block.
- [P0] **Focus moves to adjacent block after delete** → Delete a block → Cursor moves to next or previous block.
- [P0] **Focus enters textarea when navigating to code block** → ArrowDown into a code block → Cursor appears inside the textarea and is editable.
- [P0] **Focus enters button when navigating to divider** → ArrowDown into a divider → Divider receives focus (visual indicator shows).
- [P1] **Focus moves to child after toggle expand** → Expand empty toggle → Cursor in the new child paragraph.

## 17. Table Block

- [P0] Table cell editing works → Create a table, click a cell, type text → Text appears character by character with cursor staying in the cell.
- [P1] Table add row/column → Click "+ Row" or "+ Column" below the table → New row or column appears.
- [P1] Table delete row/column → Right-click a cell → Context menu with "Delete row" and "Delete column" options. Selecting one removes the row/column.
- [P1] Table minimum size enforced → Table with 1 row and 1 column → "Delete row" and "Delete column" are disabled.

### Persistence

- [P1] **Changes persist on refresh** → Make edits, refresh the page → Edits are preserved (localStorage cache).
- [P1] **Offline mode works** → Disconnect network, open the app → Seed data loads, editing works locally.

### Lint & type safety

- [P0] **`make ci` passes** → Run `make ci` → Zero type errors, zero lint warnings.
- [P0] **No SonarQube cognitive complexity violations** → Run SonarQube analysis → No new issues on modified files.