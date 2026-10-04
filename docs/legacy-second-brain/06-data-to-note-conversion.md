# Second Brain — Data ↔ Note Conversion (06 / 8)

> Owns the **defining feature**: nodes are primarily *data*; a user can *promote*
> any record into a *note* without the record ceasing to be data, and can work
> with pure data forever if they never promote. This doc makes that reversible,
> lossless, and provenance-tracked.

---

## 1. The mental model

```
            ┌─────────────────────────────────────────────┐
            │  RECORD  (truth lives in a backend, doc 02)   │
            │  e.g. tasks/42  { title, status, project… }   │
            └───────────────┬───────────────────────────────┘
                            │  promote (user action)        ▲
                            ▼                                │ demote / unlink
            ┌───────────────────────────────────────────────┐
            │  NOTE OVERLAY  (rich page, osionos page store)  │
            │  noteId, blocks[], links[[…]], backref→record   │
            └─────────────────────────────────────────────────┘
```

- **A note is an overlay, not a copy.** The record stays the source of truth for
  its structured fields. The note adds *prose, structure, links* on top.
- **`hasNote`** (doc 01) on the record node flips true → the graph shows the
  note-hue ring (doc 05). The record keeps its database color and identity.
- **Pure-data users never see notes.** No note is created implicitly; promotion
  is always an explicit action. This directly honors the brief: *"people might
  want to use only the data… we don't convert them."*

Today's `openGraphNodePage()` mints a throwaway `second-brain-*` page with a
stringified property dump and **no link back**. We replace it with a real,
reversible overlay (below).

---

## 2. Two kinds of notes

| Kind | Origin | Source record | Graph node |
|------|--------|---------------|------------|
| **Record note** | "Convert/annotate this record" | yes (`note_of` edge) | record node gains note ring; a `note` node may or may not be shown (config) |
| **Free note** | "New note" (no underlying row) | none | a standalone `note` node (reserved hue) |

Free notes can themselves *become* data: a free note may be "filed into" a
database (creates a record via `commitTxn`, then becomes a record-with-note).
So the relationship is genuinely bidirectional, not one-way.

---

## 3. The note object & where it lives

Notes reuse osionos's existing **page** system (the page store already powers
the editor, raw-mode, blocks). A note *is* a page with second-brain metadata:

```ts
interface NoteMeta {
  noteId: string;
  // provenance — null for free notes
  sourceRef: { source: string; databaseId: string; recordId: string } | null;
  // which structured fields the note "mirrors" (for two-way sync, §5)
  mirroredFields: string[];
  createdFrom: 'promote' | 'new';
  schemaVersion: number;
}
```

- Persisted via the same path as pages (and through the BaaS when enabled, doc
  02 — a note's *content* is itself data in a `notes` collection, so it gets the
  same ACID guarantees).
- The `note_of` edge (doc 01 `EdgeKind`) connects note ↔ record; rendered in the
  note hue, dotted (doc 05).

---

## 4. Promote / demote (the actions)

**Promote** (`record → record+note`):
1. Create a `NoteMeta` with `sourceRef` = the record's identity.
2. Seed note content from the record: a title block + a properties summary block
   the user can edit/delete (this is *seed*, not a binding — unlike today's dump).
3. `commitTxn`: create the note doc (atomic, doc 02). Optimistic echo: ring +
   `note` node appear instantly.
4. Inspector switches to "Open note" / inline note editor.

**Demote / unlink** (`record+note → record`):
- **Unlink** keeps the note as a *free* note (severs `sourceRef` → `note_of`
  edge removed, record loses ring). Non-destructive.
- **Delete note** removes the overlay entirely (record untouched — it was always
  the source of truth). Confirmed, because prose is user-authored content.
- A record is **never** deleted by demoting its note. Data outlives notes.

---

## 5. Two-way sync rules (the subtle part)

A note may *mirror* some structured fields (e.g. show `status` inline). Rules to
avoid divergence:

- **Record → note (always):** when the record's mirrored field changes (via any
  client / the BaaS), the note's mirrored view updates. The record is canonical.
- **Note → record (only for explicitly mirrored, structured fields):** editing a
  mirrored field *inside* the note writes back to the record via `commitTxn`
  (doc 02), with version check. Prose/blocks that aren't mirrored never write to
  the record — they live only in the note.
- **Conflict** on a mirrored field uses doc 02 §7 reconciliation.
- Mirroring is **opt-in per field** (default: none) so a note can be pure prose
  with zero write-back surface. Keeps the simple case simple.

This prevents the classic "is the note or the row the truth?" trap: *structured
fields are always the row; prose is always the note; mirrored fields are a
declared, version-checked bridge.*

---

## 6. Bulk & graph-native conversion

- **Select many → promote all:** multi-select in the graph (lasso/shift-click),
  "Convert selection to notes" → one batched `commitTxn` (atomic group, doc 02).
- **Template seeding:** promotion can use a per-database note template (e.g. CRM
  contacts seed a "call log" structure) — configured alongside the relationship
  config (doc 03 §5).
- **Filing a free note into a database:** inverse direction; inspector action
  "File into…" picks a database, maps note title→title property, creates the
  record (`commitTxn`), links them.

---

## 7. How this shows up in the graph (recap of cross-doc effects)

| Thing | Doc | Effect |
|-------|-----|--------|
| `hasNote` flag | 01 | record node gets note-hue ring/badge |
| `note` node, reserved hue | 05 | visually distinct from all data |
| `note_of` / `note_link` edges | 01/05 | provenance + inter-note links |
| atomic create/unlink/delete | 02 | no half-converted states ever visible |
| note content as `notes` data | 02 | notes are themselves ACID data |

---

## 8. Definition of done

- [ ] `NoteMeta` + note-as-page persistence (local + BaaS `notes` collection).
- [ ] Promote seeds editable content + provenance; **replaces** `openGraphNodePage`.
- [ ] Demote: unlink (keep free note) vs delete (confirmed); record never deleted.
- [ ] Per-field opt-in mirroring with version-checked write-back + conflict reuse.
- [ ] Bulk promote (atomic batch) + "file note into database" (inverse).
- [ ] `note`/`note_of` projection is purely additive over doc 01 (no node-code churn).
- [ ] Tests: promote→demote round-trips losslessly; deleting a note never
      mutates the source record; mirrored-field write-back is atomic & conflict-safe.
