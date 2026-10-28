# Variables

Write `{{NAME}}` in any text block. The editor shows the value as a chip, and the page keeps `{{NAME}}` in its source. Values come from three places: `env.json` files, the properties of the page and the pages above it, and a few built-ins.

```text
Invoice for {{CLIENT}}, due {{TODAY | add:"7d" | date:"dd/MM"}}
```

The engine half of this (syntax, AST node, chip markup) is in `packages/markdown-engine/README.md` § Variables. This page covers what osionos resolves.

## Syntax

- Type `{{` to open a menu of the names this page can use. Each row shows the current value and where it comes from. After `|` the menu lists filters with their result. ↑/↓ moves, Enter or Tab inserts, Escape closes and keeps what you typed.
- `{{NAME}}` shows a value. `{{NAME | filter | filter:"arg"}}` passes it through filters, left to right.
- An unknown name stays as literal text (`{{NOPE}}`), so a typo is visible and not an empty gap.
- To show the braces themselves, put them in a code span (`` `{{NOW}}` ``) or start with a backslash (`\{{NOW}}`).
- A bad filter or format gives a red chip. Its tooltip names the problem, for example `unknown filter "shout"`.

## env.json

An `env.json` is a code page with that title. It is an ordinary page, so it syncs, versions and shares like the others.

- A root-level `env.json` applies to the whole workspace. **Settings → General → Variables** creates it with three starter entries, or opens it if it exists.
- An `env.json` placed under a page applies to that page and every page below it. The `{{` menu's footer creates one for the current page.
- The closest file wins: a page's own `env.json` first, then its parent's, up to the workspace one.
- A place can split its variables by topic: `env.billing.json`, `env.team.json` and any other `env.<topic>.json` beside an `env.json` are read with it, as one file. On a name defined twice, `env.json` wins, then the topic files in title order. Use them when one file reaches its limit.
- Typing `{{NAME` for a name nothing defines offers **Create {{NAME}}** as the menu's last row. It asks for the value and the file: the one the page already reads from, this page's, or the workspace's. The entry is appended to that `env.json`, creating it if needed, and the rest of the file is left as written. If the file is open in the editor, the entry appears there.
- A value that names its own variable reads the next file out, as in a shell's `PATH=$PATH:x`. With `"PATH": "/bin"` at the root and `"PATH": "{{PATH}}:/project"` under a project, pages in the project see `/bin:/project`. A name that refers to itself with nothing further out is a `cycle` error chip.

An entry is either a bare value or an object with a `type`:

```json
{
  "CLIENT": "Acme",
  "COUNT": 3,
  "VAT": { "type": "number", "value": 0.2, "format": "percent" },
  "PRICE": { "type": "number", "value": 1234.5, "format": "currency:EUR", "locale": "fr-FR" },
  "LAUNCH": { "type": "date", "value": "2026-12-01", "format": "dd MMM yyyy" },
  "LIVE": { "type": "boolean", "value": false, "format": "Yes/No" }
}
```

With that file these resolve to `Acme`, `3`, `20%`, `1 234,50 €`, `01 Dec 2026` and `No`. The example is copied from `tests/canvas/variables-resolver.test.ts`.

| Field | Meaning |
| --- | --- |
| `type` | `text`, `number`, `date` or `boolean` |
| `value` | the value; a date is an ISO string (`2026-12-01`, or with a time) |
| `format` | how to print it (below) |
| `locale` | overrides the language for this value, e.g. `fr-FR` |
| `timeZone` | an IANA zone for a date-time value, e.g. `America/New_York` |

- Names start with a letter or `_` and then use letters, digits, `_` or `-`.
- A text value may contain other variables (`"Hello {{CLIENT}}"`). Nesting stops at 8 levels, and a cycle (`A` → `B` → `A`) gives an error chip, not a hang.
- A bad entry is skipped and the rest still load. The skipped entries are listed under the `env.json` editor.
- Limits: 64,000 characters per file, 500 variables, 2,000 characters per value. A page write over 128 KB is refused by the server's edge, so a single file cannot grow much further; more variables go in `env.<topic>.json` files, which have no total limit.

**env.json is not a secrets store.** Anyone who can open it can read it, and every value is printed in plain text into the pages that use it, including shared and published ones.

## Built-ins and page properties

| Name | Shows |
| --- | --- |
| `NOW` | date and time |
| `TODAY` | the date, in your time zone |
| `TIME` | the time |
| `PAGE` | the page's title |
| `page.<property>` | a property of the current page, or of the nearest page above it that has one |

- `page.<property>` matches the property's key or label, ignoring case; a space, `-` and `_` count as the same. `page.Status`, `page.due_date` and `page.DUE` all work.
- A multi-select property prints as `a, b`, and a checkbox as `true` or `false`.
- A sub-page inherits its parents' properties. If a sub-page and its project both have `Client`, the sub-page's own value wins.
- An env.json entry with a built-in's name replaces the built-in, and can read it: `"TODAY": "{{TODAY}}!"` works.

## Formats and filters

Which format applies, first match wins:

1. the inline filter (`{{LAUNCH | date:"yyyy"}}`)
2. the variable's own `format`
3. your preferences: language, date format, time zone and number format in Settings
4. the default

| Filter | Example | Result (from the tests) |
| --- | --- | --- |
| `date:"<pattern or preset>"` | `{{TODAY \| date:"yyyy-MM-dd"}}` | `2026-10-28` |
| `relative` | `{{page.due_date \| relative}}` | `next week` |
| `add:"<n><unit>"` | `{{TODAY \| add:"7d" \| date:"dd/MM"}}` | `04/11` |
| `number:"<format>"` | `{{N \| number:"fixed:2"}}` | `41.00` |
| `upper`, `lower` | `{{CLIENT \| upper}}` | `ACME` |
| `default:"<text>"` | `{{MISSING \| default:"n/a"}}` | `n/a` |

- Date presets are `short`, `medium`, `long`, `full`, `time`, `datetime`, `iso` and `relative`. Anything else is a date-fns pattern (`dd MMM yyyy`).
- `add` units are `y`, `mo`, `w`, `d`, `h` and `m`, and may be negative (`-2w`). On a number, `add:"1"` does arithmetic.
- Number formats are `decimal`, `integer`, `percent`, `compact`, `currency:<ISO code>` and `fixed:<0-20>`.
- A boolean format is `yes/no` text, for example `"Yes/No"` or `"✓/✗"`.

## When values update

- Editing any `env.json` updates every chip in the workspace.
- Renaming a page, editing a property or moving a page under another one updates the chips that read it.
- `NOW`, `TODAY` and `TIME` update on the minute, and when the tab becomes visible again.
- Changing language, date format, time zone or number format in Settings updates every chip.
- Only blocks containing `{{` re-render. **The block you are typing in updates when it loses focus**, so the caret never jumps.

## Limits

- Chips render in text blocks, tables, callouts and media captions. Code blocks, database cells and page titles show the literal `{{…}}`.
- The `{{` menu lists env names, properties and built-ins, and shows the first 50 matches. Create only appends: renaming or deleting an entry is done in the `env.json` editor.
- `relative` rounds to the largest unit: 40 days away reads "next month".
- A date pattern's offset tokens (`x`, `X`, `O`) print the browser's offset, not the variable's `timeZone`. Use a preset when the zone must be exact.
- Typing cost, measured 2026-10-28:
  - `tests/bench/variables.bench.ts` (no React; run with `npm run test:bench -- tests/bench/variables.bench.ts`):
    - a 50-chip block resolves in 96 µs median, through three env.json layers and a three-page property chain;
    - building the menu (catalog, ranking and 50 previews) takes 14 µs.
  - Scaled past the per-file limit in a scratch run (same machine, median): 5,000 variables parse in 1.65 ms and build the menu in 315 µs; 20,000 parse in 7.6 ms and build the menu in 1.46 ms. Looking up one name stays at ~65 ns at every size. Parsing runs when a file changes, not per keystroke.
  - `tests/e2e/perf/variableMenu.spec.mjs` times keydown to the painted frame on a production build. Opening the menu, re-ranking it and typing beside 10 chips each cost at most 0.5 ms over the harness floor (median; p95 ≤ 31.8 ms against a ~31 ms floor).
