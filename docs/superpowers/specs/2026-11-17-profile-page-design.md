# Profile page — design, rev 1

Status: rev 1, 2026-11-17. U1 and U2 are in build (no new endpoint, no schema, no new
exposure). U3–U8 wait for a devil ruling; U7 also needs an architect contract and the
owner's agreement on the plan. Base: osionos develop `63c376994`.

## What is asked

A profile that reads like a GitHub profile and is edited as fast as one:

1. Banner, large round avatar, a status (emoji + text) on the avatar.
2. A left sidebar: name, username, pronouns, short description, **Edit profile**,
   followers / following, location, a list of links the owner adds, achievements,
   highlights, organizations.
3. A README written in markdown and rendered by our markdown engine, able to reproduce a
   real GitHub profile README (fixture: the owner's README, `tests/fixtures/profile/
   github-readme.md`).
4. Editing happens on the page. Free-text inputs are the exception; a choice is the rule.
5. Nothing hardcoded: every value on the page comes from stored data. Values computed
   across the owner's databases (revenue, counts, …) can be placed anywhere in the app,
   the README included.
6. The profile of the reference account is built with it, end to end.

## What exists (measured on `63c376994`)

| Part | State | Where |
|---|---|---|
| Default view | 96 px avatar, name, pronouns, role · presence; sections with no data render nothing | `src/widgets/profile-page/ProfileView.tsx:63-92` |
| Bio, headline, username, status | stored and served, never rendered | `accountProfileApi.ts:35-57`, `bridge-account-profile.mjs:275-297` |
| Edit | a jump to Settings; status lives in Settings › Social; username behind re-auth | `OwnerActions.tsx:91`, `PresenceStatusControls.tsx:71-121` |
| Form logic | 13 fields, validators, diff, save with 412/422 handling | `features/settings/profile/profileFields.ts`, `useAccountProfileStore.ts:67-89` |
| README | a page of blocks, copied into the profile response (owner check, 200 KB cap, unapproved bindings removed) | `bridge-account-profile.mjs:309-325`, `ReadmeBlocks.tsx:39-45` |
| Raw HTML in markdown | off: shown as a code block. When on, injected with `dangerouslySetInnerHTML`, no allowlist | `packages/markdown-engine/markdown/renderers/react.tsx:331` |
| Follows | bridge has counts and lists; client has counts only; nothing on the profile | `scripts/bridge-social-follows.mjs:45-130`, `followApi.ts` |
| Bound fields | paragraph / heading blocks bound to 13 profile fields | `entities/block/model/binding.ts:22-88` |
| Computed values | formula and rollup exist as database properties only | `notion-database-sys/src/store/slices/computedSlice.ts` |
| Anonymous view | none: every route needs a session; a signed-out viewer gets an endless spinner | `useProfile.ts:84-85` |
| CSP | `frame-ancestors 'none'` only; no `img-src` | `docker/services/node/nginx.conf:22` |

## Layout

```
┌──────────────────────────── banner (3:1, optional) ────────────────────────────┐
├───────────────┬────────────────────────────────────────────────────────────────┤
│ avatar + 🎯   │ Highlights (≤ 6 pinned cards)                           (U6)   │
│ Name          │ ┌────────────────────────────────────────────────────────────┐ │
│ @user · pron. │ │ README                                          [Edit]     │ │
│ headline      │ │ …                                                          │ │
│ bio           │ └────────────────────────────────────────────────────────────┘ │
│ [Edit profile]│ Shared posts (existing grid)                                   │
│ 12 followers · 4 following                                             (U5)    │
│ company · location · local time · links                                        │
│ Achievements (U6) · Organizations (U5)                                         │
└───────────────┴────────────────────────────────────────────────────────────────┘
```

- ≥ 768 px: sidebar 296 px + fluid main. Below: one column, sidebar first.
- The avatar overlaps the banner by half its height when a banner exists.
- An empty section renders nothing for a visitor. The owner sees one call-to-action row
  per empty section ("Add a bio", "Write your README").
- The shell wraps the default and the profession branch. The admin-template branch keeps
  its own layout.

## Units, in order

### U1 — sidebar shell, everything already served is shown

- New widget parts under `src/widgets/profile-page/`: `ProfileShell` (grid), `ProfileSidebar`
  (identity, status, facts), owner empty states. `ProfileView` shrinks to composition.
- Status typed on the client (`emoji`, `text`, `busy`, `expiresAt`) and read from the card
  the page already fetches. Bio, headline, location come from the account card only (the
  legacy route's older copy is no longer read by the page).
- `Avatar` in `@osionos/ui` gains a larger size (additive). No raw hex, no `text-[Npx]`.
- Done when: canvas tests cover each field present / absent, owner / visitor; the parity
  spec passes at 375 and 1440 px, light and dark; an axe scan of the profile page has no
  WCAG AA violation.

### U2 — edit on the page

- **Edit profile** swaps the sidebar for a form in place; **Save** / **Cancel**; the
  page never leaves. One form component, used by the page and by Settings (the settings
  section becomes a host of it). Validators, diff and store are reused unchanged.
- Choices before text:

| Field | Input |
|---|---|
| Pronouns | select (she/her, he/him, they/them, prefer not to say) + "Custom" reveals a 40-char input |
| Status | emoji picker restricted to emoji, text with stored presets, busy toggle, expiry select |
| Location | country select (the list the database place editor uses) + optional city; stored in the existing column |
| Links | rows with add / remove; the kind (GitHub, GitLab, LinkedIn, X, YouTube, site) is derived from the host and picks the icon. A `mail` kind is not built: the link validator is https-only, and a public e-mail link changes what the bridge accepts, so it is ruled with U5 |
| Timezone | existing select |
| Avatar, banner | existing uploaders, opened by clicking the image in edit mode |
| Username | shown; "Change" opens the existing re-auth modal |
| Name, headline, bio, company | text, with a counter |

- Status saves through its own endpoint; a failed status save does not lose the profile
  edit and the reverse.
- Done when: an e2e edits every field on the page and reloads to the saved values; a 412
  shows the conflict banner with the server's row; `check-built-with-blocks.sh` is green.

### Built in U1 + U2, differences from rev 1

- **Country list.** An inline ISO 3166 alpha-2 code list named through `Intl.DisplayNames`
  (`features/settings/profile/countries.ts`), not the database place editor's list, which is
  partial and private to a vendored package. Stored as "City, Country" or "Country" in the
  existing `location` column (120 characters).
- **Avatar and banner.** The existing uploader rows sit at the top of the edit form; the image
  on the page is not itself a click target.
- **Edit mode width.** The sidebar is 296 px when reading and widens to 26 rem when editing,
  because the form does not fit 296 px.
- **Followers and following.** Not shown until U5 (their routes are not verified against a
  blocked viewer yet).
- **Links.** No `mail` kind (see the Links row above).
- **Emoji.** The status picker is the app's `EmojiPicker` with a filter: a pick that is not an
  emoji is refused with a message. The library has no prop to hide its Icons tab.
- **Status in Settings.** Settings > Presence and status hosts the same `StatusFields` and
  `useStatusEdit` (`StatusPanel`) behind its own Save; the old duplicate editor is gone.
- **Name on the page.** The card's `displayName` wins over the legacy route's `name`, so a
  saved name shows at once.
- **Prompts.** The owner sees both "Customize" and a "Write your README" row.

### U3 — markdown engine: the GitHub HTML subset, parsed, never injected

- The engine parses an allowlisted HTML subset into its own AST and renders React
  elements. `dangerouslySetInnerHTML` is not used on this path.
- Tags: `div p span a img br hr sub sup b i em strong code pre kbd details summary table
  thead tbody tr td th h1–h6 ul ol li blockquote`. Attributes: `align`, `valign`,
  `width`, `height`, `colspan`, `rowspan` (bounded), `href`, `src`, `alt`, `title`.
  Everything else is dropped: `style`, `class`, `id`, every `on*`, `script`, `iframe`,
  `form`, `svg`, `object`. Comments are dropped. An unknown tag is shown as text.
- Markdown inside a block-level tag is parsed (CommonMark: after a blank line), so a
  fenced code block inside a `<td>` renders highlighted.
- `src`: https only, plus the app's own media paths. `href`: the existing `sanitizeUrl`.
- Bounds: nesting ≤ 16, input ≤ 200 KB (the README cap).
- Done when: the fixture README renders with the expected structure (DOM assertions and
  a screenshot); the engine's fuzz suite and an XSS vector corpus produce no script, no
  handler and no `javascript:` URL; existing engine suites stay green.
- Open for the ruling — remote images. (A) load them directly with
  `referrerpolicy="no-referrer"` and lazy loading: the viewer's address reaches the image
  host. (B) a bridge image proxy: hides the viewer, adds an SSRF surface and bandwidth.
  Recommended: A now with an explicit `img-src` policy, B as its own unit.

### U4 — a README written as markdown

- The README stays a page of blocks, so bound fields, database blocks and markdown mix.
- Markdown source lives in a block that renders through the engine with the U3 subset,
  with a source / preview editor. Pasting a README offers "keep as markdown".
- Open for the ruling — the block shape. (A) the existing `code` block, language
  `markdown`, plus an additive "rendered" flag: an older client shows the source as code.
  (B) a new block type: cleaner, but an older client shows an unknown block.
  Recommended: A.
- README card: header with **Edit** for the owner, opening the page in the editor pane.

### U5 — followers, following, organizations

- Counts in the sidebar, lists in a modal (50 per page), follow button on the page.
- Before any of it is shown: verify the counts route against a blocked viewer and the
  lists against a directory opt-out; fix in the bridge where missing.
- Organizations are opt-in per membership, default hidden; the card shows name and
  avatar only. The legacy route stops returning `role` and `workspaceId` to other users.

### U6 — highlights and achievements

- Highlights: up to 6 items the owner pins (page, database, shared post), ordered; the
  server returns only the ones the viewer may open.
- Achievements: rules stored as data (metric, threshold, title, icon), evaluated on U7.
  No per-user list in code.

### U7 — computed values across databases

- A **metric** is a named value the owner defines: one or more databases, a property, an
  aggregate (sum, count, average, min, max, latest), a filter, a format; a metric may
  combine other metrics.
- It is exposed through the existing binding registry as a record source, so any
  paragraph or heading binds to it with the existing popover, and through the variable
  chip inline.
- For another viewer the value is computed on the server as the owner, and only for
  metrics the owner marked public — the same rule the README applies to bound fields.
- Needs an architect contract (where it is evaluated, how it is cached and invalidated,
  cross-engine sources) and a ruling before any code.

### U8 — anonymous view (only if wanted)

- A signed-out read of the fields the owner marked public, rate-limited, with no
  directory listing. Not started without an explicit request.

## Not in this design

- i18n of the page (the libraries are installed and unused across the app).
- A second profile read path: the page keeps two requests until U5 touches the route.
- Importing GitHub data (stars, contributions). Stat images in a README are remote images.
- Anything a visitor can type on someone else's profile.

## Unknowns to close in the unit that needs them

- Whether the migration with the status columns is applied on the live database (U1 read).
- Markdown `[![alt](img)](href)`, inline code in headings, comments across paragraphs,
  nested lists in the engine (U3 tests).
- What `{{expr}}` shows in another person's README, and what a database block shows to
  another viewer (U7).
