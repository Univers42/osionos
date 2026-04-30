List of Functionalities and Expected Behaviors

## 1. Slash Menu

**Functionality:** Open and use the slash menu to change or insert block types.

**Expected Behavior:**

Opens when typing / in an empty paragraph.
Filters options as you continue typing.
Allows selection with Enter or click.
Cleans the text used to invoke it (/quote, /, etc.) upon conversion.
Does not create extra blocks upon conversion.
Closes with Escape.
Closes when the / is deleted.
Can be reopened normally after previous uses.
When navigating with arrow keys, the active menu item auto-scrolls to remain visible.

## 2. Markdown Shortcuts

**Functionality:** Automatic conversion of initial text to block types.

**Expected Behavior:**

# converts to heading_1.

- converts to bulleted_list.

1. converts to numbered_list.
``otypescript`` converts to code block.

-- converts to divider.

[] or equivalent Markdown syntax converts to to_do.

The prefix used to activate the shortcut is removed upon conversion.

## 3. Block Indentation and Outdentation

**Functionality:** Nesting and outdenting blocks within the hierarchy using Tab and Shift+Tab.

**Expected Behavior:**

Tab nests the block under its sibling, if possible.
Shift+Tab outdents the block one level.
At the root level, Shift+Tab does nothing.
At the first block, Tab does nothing if there is no possible parent.
Indentation respects multilevel hierarchy. Outdentation occurs one level at a time.
From the root level, a single Tab indents the block to the next logical level, not too deep.

## 4. Indentation Rules Based on Block Type

**Functionality:** Controlling which blocks can have children or be indented.

**Expected Behavior:**

A heading can be indented under a paragraph.

A block cannot be indented under a heading.

You cannot indent below a code block.
You cannot indent below a separator.
You can indent below a callout.
You can indent below a quote.
In a code block, Tab inserts spaces; it does not change the hierarchy.
Types marked as NON_PARENTABLE do not accept children.
NON_INDENTABLE types do not respond to structural indentation.

## 5. Enter Behavior in Standard Blocks

**Functionality:** Creating new blocks or line breaks with Enter.

**Expected Behavior:**

In a paragraph, it creates a new paragraph below.
In a heading, it creates a normal paragraph below.

In a code block, it inserts a new line within the code.

In a divider, Enter creates a paragraph below.

Focus passes to the new block when appropriate.

## 6. Automatic Continuation of Lists

**Functionality:** Maintaining the list type when pressing Enter.

**Expected Behavior:**

In a bulleted list, it creates another bulleted item.

In `numbered_list`, create another numbered item.
In `to_do`, create another unchecked item.

If the item is empty, `Enter` converts it to a paragraph.
In an empty `to_do`, it also clears the checked state when converting to a paragraph.

Bulleted list markers cycle based on indentation depth: filled circle (●) at level 0, hollow circle (○) at level 1, filled square (■) at level 2. The pattern repeats from level 3 onward.
Numbered list markers rotate style based on indentation depth: decimal (1.) at level 0, lowercase alpha (a.) at level 1, lowercase roman (i.) at level 2, uppercase alpha (A.) at level 3, uppercase roman (I.) at level 4, and shape markers at level 5. The pattern repeats from level 6 onward.
This is a visual rendering detail of existing list functionality, not a new interaction pattern. Adding it to §6 and §15 keeps the document organized without inflating the section count.

## 7. Enter in container blocks

**Functionality:** Create children within the container block itself.
**Expected behavior:**

In `callout`, `Enter` creates a child inside the box.
In `quote`, `Enter` creates a child inside the border.
In `toggle`, `Enter` expands and creates a child inside.
It does not create the new block outside the container.

## 8. Deletion with Backspace/Delete in empty blocks

**Functionality:** Delete or convert empty blocks according to their type.

**Expected behavior:**

An empty paragraph at the root is deleted.

An empty heading is converted to a paragraph, not deleted.

An empty list item is deleted.

A focused divider is deleted with Backspace or Delete.
The focus is reassigned to an adjacent block.

## 9. Promoting Children When Deleting a Parent

**Functionality:** Preserving child content when deleting an empty parent.

**Expected Behavior:**

If an empty parent block is deleted, its children are promoted to the parent's level.
The internal structure of grandchildren and deeper levels is preserved.
In some empty indented blocks, Backspace may outdent instead of deleting directly.

## 10. Block Context Menu

**Functionality:** Operating on a block from a context menu.

**Expected Behavior:**

Opens with a right-click.
Also opens from the drag handle.
Allows inserting above and below.
Allows duplicating.
Allows moving above and below.
Allows converting a block to another type.
Allows copying text.
Allows deleting.
Deleting a parent deletes the entire subtree.
Duplicating a parent also duplicates the subtree as a separate copy.

## 11. Drag and Drop

**Functionality:** Reordering and moving blocks in the hierarchy.

**Expected Behavior:**

Allows reordering siblings at the same level.
Allows moving blocks between different groups/trees.
Allows dropping a child to the root.
Allows moving blocks between different parent nodes.
Dragging a block with children preserves its subtree.
Does not allow dropping onto itself.
Displays a visual drop indicator.
The dragged block is displayed with reduced transparency.
Cross-tree operations use moveBlockAcrossTree, which is a distinct operation from standard block movement.

## 12. Toggle

**Functionality:** collapsible block with children.

**Expected Behavior:**

Expands and collapses with the chevron. Pressing Enter in the summary creates a child inside.
If empty, displays a hint like “Empty toggle”.
Its children accept slash menus and Markdown shortcuts.
Indentation is possible within the toggle.
When collapsing and reopening, the children are preserved.

## 13. Callout as a Container

**Functionality:** Callout block with icon and child content.

**Expected Behavior:**

Pressing Enter creates children inside the box.
Children are visually rendered within the colored background.
Slash menus function within their children.
If the empty callout is deleted, its children are promoted.

## 14. Quote as a Container

**Functionality:** Quote block with nested children.

**Expected Behavior:**

Pressing Enter creates children inside the quote.
Children are visible within the side border.
It can contain multiple correctly rendered children.
If the empty quote is deleted, its children should be promoted according to the editor's logic.

## 15. Read-Only Rendering

**Functionality:** Correct display of blocks without editing.

**Expected Behavior:**

All block types are rendered correctly.
The nested hierarchy looks good.
Callout children are visible within the box.

Quote children appear within the border.
Toggles can still expand and collapse.
Numbered lists rotate marker style by indentation depth (decimal → alpha → roman), matching editor behavior.

Bulleted lists cycle marker shape by indentation depth (● → ○ → ■), matching editor behavior.
This is a visual rendering detail of existing list functionality, not a new interaction pattern. Adding it to §6 and §15 keeps the document organized without inflating the section count.

## 16. Pasting Content

**Functionality:** Interpretation of pasted text.

**Expected Behavior:**

Multiline markdowns become multiple blocks.
Pasted code fences create a code block.
A single short line remains as inline text within the current block.

## 17. Floating Text Selection Toolbar

**Functionality:** Display inline tools when text is selected.

**Expected Behavior:**

Appears only with a non-collapsed selection.
Does not appear with an unselected caret.
Disappears when the selection is cleared.
Disappears when focus is lost outside the editor.
Not used within code text areas.

## 18. Text Color

**Functionality:** Apply color to selected text.

**Expected Behavior:**

The button opens the color palette. 19. Background Color / Highlight

**Functionality:** Apply a background to the selected text.

**Expected Behavior:**

The button opens the color palette.

Only the selected text is colored.

The color persists as you continue typing within that region.

It can coexist with other formatting.

If you apply the same color again, it is removed.

It should not include trailing whitespace when highlighting.

## 20. Inline Formatting

**Functionality:** Apply inline styles to the text.

**Expected Behavior:**

Bold is correctly toggled on and off.
Italic is correctly toggled on and off.
Strikethrough is correctly toggled on and off.
Inline code correctly wraps the selection.
Inline code should preserve inherited custom colors where applicable. Format combinations should remain stable after editing, writing, or deleting.

## 21. Inline Links

**Functionality:** Convert selected text into an external or internal link.

**Expected Behavior:**

The link button opens the link type selector.

It allows you to create a web link with a URL.
It allows you to create an internal link to a page.
The page search filters results.
If there are no results, it displays an empty status.

Cancel or Escape closes the picker without changes.

## 22. Launch Slash Menu from Selection

**Functionality:** Open the slash menu from the floating toolbar.

**Expected Behavior:**

When you press / in the toolbar, the slash menu opens near the selection.

The floating toolbar closes when you do so.

## 23. Page Icon

**Functionality:** Assign, change, or delete a page icon.

**Expected Behavior:**

If there is no icon, “Add icon” assigns one.

Clicking the icon opens the picker.

When you select an asset, the icon updates.

“Remove icon” removes the icon.

The picker closes with a click outside or Escape.

## 24. Callout Icon

**Functionality:** Change the callout icon.

**Expected Behavior:**

Clicking the callout icon opens the picker.
Choosing an asset updates the icon.

“Remove icon” restores the default icon 💡; it does not leave it empty.

The picker closes with a click outside or Escape.

## 25. Page Cover

**Functionality:** Assign, change, or delete a page cover.

**Expected Behavior:**

“Add cover” assigns a cover if one doesn't exist.

“Change cover” opens the picker.
Choosing a cover updates the cover immediately.
Deleting a cover removes it, and “Add cover” reappears.

The picker closes with a click outside or Escape.

## 26. Media Blocks

**Functionality:** Create and edit image, video, audio, and file blocks.

**Expected Behavior:**

Blocks can be created from the slash menu.

If the paragraph is empty, the current block is converted.

If the paragraph already contains text, a new block is inserted below.

The preview corresponds to the media type. Changing the asset updates the preview without changing the block type.

If there is no asset, a placeholder appears.
The picker closes with a click outside the box or by pressing Escape.

The caption is editable inline and supports the formatting toolbar.

## 27. Block Category Registration Compliance

**Functionality:** Respect internal category rules (NON_INDENTABLE, NON_PARENTABLE, enterCreatesChild).

**Expected Behavior:**

Non-indentable blocks should not react to structural indentation.
Non-parentable blocks should not accept children via Tab.
Blocks marked as enterCreatesChild should create children when Enter is pressed.
Blocks not marked as such should create siblings or lines, not children.

## 28. Focus Management

**Functionality:** Correctly move focus after structural actions.

**Expected Behavior:**

After Enter, focus goes to the new block.
After deleting, focus goes to the next or previous logical block.
When expanding an empty toggle to create a child, focus goes to that child.

## 29. Local Persistence

**Functionality:** Preserve editor changes.

**Expected Behavior:**

Changes survive refreshes.

In offline mode, the seed/local data is loaded and editing can continue.

## 30. Technical Integration Quality

**Functionality:** Maintain the editor without compromising the overall quality of the project.

**Expected Behavior:**

`make ci` passes without type or lint errors.
No new complexity violations appear in SonarQube for the modified files.

## 31. Arrow Navigation

**Functionality:** Navigate between blocks and through content-rich blocks using arrow keys.

**Expected Behavior:**

Arrow Down at the end of a block jumps to the next block.
Arrow Up at the start of a block jumps to the previous block.
Focus on a divider button allows arrow keys to jump to the next or previous block.
In a code block, the cursor enters the textarea; arrow keys move the cursor within the code.
The cursor exits the code block at the top (Arrow Up) or bottom (Arrow Down), jumping to adjacent blocks.
In a table or database block, focus enters the first cell; arrow keys navigate between cells.
When navigating outside the viewport, the page smooth-scrolls to keep the focused block visible.

## 32. Page Permissions ABAC

**Functionality:** Control visibility and ownership of pages using Attribute-Based Access Control (ABAC).

**Expected Behavior:**

Only the owner can move a page from Shared to Private status.
Non-owners cannot see private workspaces as a destination in the Move modal.
Non-owners can duplicate pages as an alternative to moving them.
Private pages are only visible to their owner.
Shared pages are visible to all users with workspace access.
Page status (private/shared) is displayed in the page listing.

## 33. Table Cell Editing

**Functionality:** Edit content within table cells while maintaining cursor position and structure.

**Expected Behavior:**

Typing in a cell keeps the cursor within that cell; it does not move after each character.
Add Row inserts a new row below the current row.
Add Column inserts a new column to the right of the current column.
Delete Row removes the current row (via context menu).
Delete Column removes the current column (via context menu).
A table must always have at least 1 row and 1 column; deletion is prevented if it would violate this constraint.
Cells support inline formatting (bold, italic, links, etc.).
Pressing Tab moves to the next cell; Shift+Tab moves to the previous cell.
Pressing Enter creates a new row below.

## 34. Duplicate Title Numbering

**Functionality:** Assign incremental numbering to duplicated pages.

**Expected Behavior:**

When duplicating a page, the title receives an incremental suffix instead of "(Copy)".
The first duplicate is titled with " (1)".
Each subsequent duplicate increments the number: " (2)", " (3)", etc.
The original page title is not modified.
If a page with the incremental suffix already exists, the next available number is used.
The numbering is applied to the full duplicated page and all its children.
