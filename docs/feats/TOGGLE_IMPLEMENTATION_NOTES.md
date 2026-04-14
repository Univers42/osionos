# Toggle Block — Implementation Notes

**Date:** April 12, 2026
**Branch:** `feature/toggle`
**Status:** Editable children working. Expand/collapse working. Linter clean.

---

## What was implemented

The toggle block (`/toggle` from slash menu) now supports editable content inside. Previously, expanding a toggle showed a static "Empty toggle" label with no way to add or edit content.

### Changes made

| File | What changed | Why |
|------|-------------|-----|
| `ToggleBlockEditor.tsx` | Replaced static `dangerouslySetInnerHTML` children and "Empty toggle" span with `EditableContent` components | Children need to be editable, not read-only |
| `BlockEditor.tsx` | Added `pageId={pageId}` prop to `<ToggleBlockEditor>` | Component needs `pageId` to persist children via `usePageStore.updateBlock` |
| `PlaygroundPageEditor.tsx` | Added `block.type !== "toggle"` guard on line 191 | Prevents `BlockTree` from rendering toggle children a second time outside the toggle |

### How it works

```
User creates toggle via /toggle slash command
  → BlockEditor renders ToggleBlockEditor with pageId
  → Chevron click expands toggle
    → If no children exist, creates one empty paragraph child
    → useEffect with pendingFocusId ref waits for React to render, then focuses
  → Each child is an EditableContent with its own onChange/onKeyDown
  → Children are persisted via usePageStore.updateBlock(pageId, blockId, { children })
  → PlaygroundPageEditor skips BlockTree for toggle children (avoids duplication)
```

### Keyboard behavior inside toggle

| Key | Behavior |
|-----|----------|
| Enter on summary | Expands toggle, focuses first child (creates one if empty) |
| Enter on child | Inserts new empty child below |
| Backspace on empty child | Removes child, focuses previous (or clears if last) |
| Arrow Up | Focuses previous child |
| Arrow Down | Focuses next child |

### Design decisions

**`useMemo` for children array.** `block.children ?? []` creates a new array reference on every render, which invalidates all `useCallback`/`useEffect` hooks that depend on it. Wrapping in `useMemo` fixes the `react-hooks/exhaustive-deps` warnings.

**`pendingFocusId` ref pattern.** When creating a new child and expanding simultaneously, the child DOM element doesn't exist yet because React batches state updates. The ref stores the ID, and a `useEffect` fires after render to focus it.

**`focusBySelector` helper.** Extracted outside the component as a pure function to avoid SonarQube cognitive complexity warnings and to make the focus logic testable.

**No `parseInlineMarkdown` import.** The previous version imported it to render static children. Since children are now `EditableContent` components, inline markdown rendering is handled internally by `EditableContent` (on blur).

---

## Known limitations

### Children are paragraph-only

Currently, toggle children are always rendered as `EditableContent` (plain paragraph blocks). They don't support sub-toggles, tables, code blocks, or other complex block types inside.

**To fix:** Replace the `EditableContent` map in `ToggleBlockEditor` with a `BlockEditor` render for each child, similar to how `PlaygroundPageEditor.BlockTree` works. This requires:

1. Passing `onChange`, `onKeyDown`, `registerRef` callbacks for each child
2. Handling slash commands inside toggle children
3. Supporting drag-and-drop between toggle children and page-level blocks

This is a significant change and should be a separate ticket.

### No markdown shortcut to create toggles

The toggle can only be created via the `/toggle` slash command. There is no keyboard shortcut (like `>` + space) to convert a paragraph to a toggle inline. The `shortcutsDetect.ts` file would need a toggle detection rule added before the quote fallback.

### Toggle state not persisted

The `expanded` state is local React state (`useState`). If the page reloads, all toggles reset to their default state (`!block.collapsed`). To persist, `collapsed` should be updated in the store on toggle:

```typescript
const handleToggle = useCallback(() => {
  const opening = !expanded;
  setExpanded(opening);
  updateBlock(pageId, block.id, { collapsed: !opening });
  // ... rest of logic
}, [...]);
```

### No animation on expand/collapse

The children appear/disappear instantly. A CSS transition on `max-height` or `grid-template-rows` would make it smoother, but adds complexity for minimal MVP value.

---

## Future work

| Task | Priority | Complexity |
|------|----------|------------|
| Nested block types inside toggle (tables, code, sub-toggles) | High | High |
| `>` + space shortcut to create toggle | Medium | Low |
| Persist collapsed state to store | Medium | Low |
| Expand/collapse animation | Low | Low |
| Drag-and-drop children within toggle | Low | Medium |