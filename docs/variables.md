# Variables

Write `{{NAME}}` in any text block. The editor shows the value as a chip, and the page keeps `{{NAME}}` in its source. Values come from three places: the workspace's `env.json`, the page's own properties, and a few built-ins.

```text
Invoice for {{CLIENT}}, due {{TODAY | add:"7d" | date:"dd/MM"}}
```

The engine half of this (syntax, AST node, chip markup) is in `packages/markdown-engine/README.md` § Variables. This page covers what osionos resolves.

## Syntax

- `{{NAME}}` shows a value. `{{NAME | filter | filter:"arg"}}` passes it through filters, left to right.
- An unknown name stays as literal text (`{{NOPE}}`), so a typo is visible and not an empty gap.
- To show the braces themselves, put them in a code span (`` `{{NOW}}` ``) or start with a backslash (`\{{NOW}}`).
- A bad filter or format gives a red chip. Its tooltip names the problem, for example `unknown filter "shout"`.

## env.json

Each workspace has at most one: a root-level code file titled `env.json`. **Settings → General → Variables** creates it with three starter entries, or opens it if it exists. It is an ordinary page, so it syncs, versions and shares like the others.

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
- Limits: 64,000 characters per file, 500 variables, 2,000 characters per value.

**env.json is not a secrets store.** Anyone who can open it can read it, and every value is printed in plain text into the pages that use it, including shared and published ones.

## Built-ins and page properties

| Name | Shows |
| --- | --- |
| `NOW` | date and time |
| `TODAY` | the date, in your time zone |
| `TIME` | the time |
| `PAGE` | the page's title |
| `page.<property>` | a property of the current page |

- `page.<property>` matches the property's key or label, ignoring case; a space, `-` and `_` count as the same. `page.Status`, `page.due_date` and `page.DUE` all work.
- A multi-select property prints as `a, b`, and a checkbox as `true` or `false`.
- An env.json entry with a built-in's name replaces the built-in.

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

- Editing `env.json` updates every chip in the workspace.
- `NOW`, `TODAY` and `TIME` update on the minute, and when the tab becomes visible again.
- Changing language, date format, time zone or number format in Settings updates every chip.
- Only blocks containing `{{` re-render. **The block you are typing in updates when it loses focus**, so the caret never jumps.

## Limits

- Chips render in text blocks, tables, callouts and media captions. Code blocks, database cells and page titles show the literal `{{…}}`.
- No `{{` picker yet. Type the name.
- `relative` rounds to the largest unit: 40 days away reads "next month".
- A date pattern's offset tokens (`x`, `X`, `O`) print the browser's offset, not the variable's `timeZone`. Use a preset when the zone must be exact.
- Typing cost is measured by `tests/bench/variables.bench.ts`: a block with 50 chips resolves in 73 µs median on 2026-10-28. Run it with `npm run test:bench -- tests/bench/variables.bench.ts`.
