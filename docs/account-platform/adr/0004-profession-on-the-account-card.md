# ADR 0004 — the full account card carries `profession`

Status: accepted 2026-10-22 (devil verdict PROCEED-WITH-CONDITIONS on the P2-4-d re-spec,
D-P2-4ds). Amends P1-2a contract 3 (`wp/P1-2a.md:44-49`).

## Decision
`GET /api/users/:username` answers the **full** card with one more field, `profession` (`null` or
one of the eight profession ids). The **reduced** card, served to a blocked viewer or to anyone
when the owner opted out, is unchanged and never carries it. The owner writes the field through
the existing `PATCH /api/account/profile` with `If-Match`; there is no second route and no second
version holder.

## Why
The profession is public by design: it picks the profile and Home templates others see. A second
route would duplicate the owner check, the rate limit and the body cap, and its writes would bump
`version` behind the Settings form's ETag.

## Consequences
- **Deploy order.** `OWNER_SELECT` and `CARD_SELECT` (`scripts/bridge-account-profile.mjs:77-78`)
  name the column, so the root migration is applied before the bridge image ships. Rollback is the
  mirror: the image first, the column drop last.
- **Client.** `src/shared/api/accountProfileApi.ts` is the one module that calls `fetch` for the
  profile route, because the shared `http-gate` client can neither send `If-Match` nor return the
  412 body (`packages/http-gate/src/client.ts:33`, `errors.ts:24-34`).
  `src/store/settings/useAccountProfileStore.ts` is the one holder of `version`; it is never
  persisted.
- **Known read.** The service-role card read selects `profession` even for a blocked viewer; the
  reduced body drops it. Nothing leaks, but the column is read where it is not needed.
