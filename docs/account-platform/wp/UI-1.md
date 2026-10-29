# UI-1 — dialogs whose content touches the frame get the house padding

## Why (verified anchors)

- The kit `Modal` (`packages/osionos-ui/src/primitives/Modal.tsx:161-166`) renders no padding, and
  its `title` is `sr-only`. Consumers pad their own content:
  - `p-4`: `src/features/page-export/ui/ExportDialog.tsx:94`,
    `src/features/block-editor/ui/LinkBlockDialog.tsx:44`;
  - `p-6`: `src/features/settings/people/PeopleDatabasePanel.tsx:54`, `PeoplePeek.tsx:191`.
- About 25 consumers forgot. On the F-3b2 screenshots (Emails dialog, 375 and 1440, light and dark),
  the label, the input and the footer text touch the dialog's left edge. The same root-wrapper
  pattern (`space-y-4` with no padding) appears in, for example:
  - `src/features/settings/ui/sudo/SudoPrompt.tsx` (`PromptBody`), shown before every sensitive action;
  - `src/features/settings/ui/ConfirmModals.tsx`.
- The candidate list comes from a query, not a reading:
  - Command: for each file with `<Modal`, the first `className=` within two lines after it, when it
    has no `p-`, `px-`, `py-`, `pt-` or `pb-` class.
  - Result: `src/features/{communities/CreateCommunityModal, group-chat/CreateGroupModal, page-management/ui/MovePageModal, professions/ui/ProfessionPickerModal, settings/PageSelectorModal, settings/ui/ConfirmModals, settings/import/ImportPanel, settings/ui/sudo/SudoPrompt, settings/preferences/PreferencesPanel, settings/billing/BillingPanel, settings/mail-calendar/MailCalendarPanel, baas-console/ui/CreateKeyModal, settings/notifications/NotificationsPanel, settings/plans/PlansPanel, settings/teamspaces/TeamspacesPanel, settings/profile/ProfileSecurityModals, settings/developer/AddKeyModal, settings/developer/CreateTokenModal, settings/profile/TwoFactorModal, workspace-onboarding/ui/WorkspaceIntentModal, quick-capture/ui/QuickCaptureModal}.tsx`
    and `src/widgets/{channel-list/CreateChannelModal, chat-shell/ui/ConnectorConsentModal, chat-shell/ui/ConnectionOnboarding}.tsx`.
  - Caveat: this is a text match on the first wrapper. A dialog that pads a deeper element, or is
    full-bleed on purpose (`MovePageModal`'s list, for example), is a false positive. That is why
    every candidate is checked on screen before it is changed.

## Contract

1. For each candidate, open the dialog in the running app and take a screenshot before changing it.
   Then decide:
   - **Flush** (text or controls touch the frame) → pad it.
   - **Padded deeper, or full-bleed by design** (a list or search bar running edge to edge with
     its own inner padding) → leave it alone, and record why in the report table.
2. Padding is `p-6` on the content root, matching `PeopleDatabasePanel`. Use `p-4` on a `size="sm"`
   dialog where `p-6` crowds the 375 px width; say which in the table. Nothing else changes: no
   header, no close button, no copy, no new tokens or raw px values.
3. Do NOT change the kit `Modal` primitive. The eight consumers that pad today would get double padding.
4. `src/features/settings/profile/EmailManagerModal.tsx` and `EmailManagerBody.tsx` belong to F-3b2,
   which fixes them. Do not touch them.

## OWNS

- The candidate files above, each only at its dialog content root's `className`.
- `target/shots/UI-1/` for screenshots (not committed).
- New or changed tests, but only where an existing test pins a class string you change. Report each one.

## MUST NOT TOUCH

- `packages/**` (the kit is a submodule) and generated tokens.
- `EmailManagerModal.tsx`, `EmailManagerBody.tsx`, `.env*`, vendored trees.
- Any logic: this is a class-only change.

## How to open each dialog

- Use the Playwright offline build: `npm run test:e2e` brings up the `:3004` Vite with
  `VITE_ALLOW_OFFLINE_MODE=true`. A short throwaway spec under `target/` drives it, or the
  existing `tests/e2e/support` helpers do. `PW_BROWSER_SOURCE=system` is required on this host.
- A dialog that cannot be opened offline (it needs the bridge) is checked against the bridge-stub
  build (`PLAYWRIGHT_BRIDGE_STUB=1`). A dialog that cannot be opened in either is left alone and
  reported as `not reachable`. Never guess.

## Report

One table: file | reachable? | before (flush / padded / full-bleed) | change (`p-6`, `p-4` or none) |
after screenshot path. Screenshots go in light and dark at 375 and 1440 for every changed dialog,
taken after the open animation ends.

## Gates

- `test:quality` (eslint and the token checks).
- `test:canvas`.
- The e2e specs that open any changed dialog. Find them with `rg -l "<the dialog's test id or heading>" tests/e2e`.

## Commit message

`fix(ui): dialogs whose content touched the frame get the house padding`
