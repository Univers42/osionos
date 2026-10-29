# ADR 0009 - a 2FA step-up starts a new refresh family that stays aal2

Status: accepted 2026-10-24 (D-F-2s, PROCEED-WITH-CONDITIONS; orchestrator decision 1).

## Decision

An accepted second-factor code (confirm, verify, recovery verify, disable) mints a new session
row as the root of a new refresh family, signs a new aal2 access token for it (new jti, same
expiry as the old session) and revokes the old family with reason `step_up`. The new family is
**not gated**: a refresh inside it stays aal2 until the family's absolute expiry
(`familyRefreshExp`, about 7 days from the step-up) or a revoke.

## Why

Confirm and disable write a session cut-off that refuses the old family, so the only refresh
token the device held died with it and the user signed in again after about an hour. A gated
family would refresh to aal1 and ask for a code every hour: that is the bug this removes.

## The bound (what this accepts)

In this tree "aal2" only means "not mfa-pending" (`bridge-session-token.mjs`). A stolen refresh
token from a post-step-up family therefore needs no code for up to about 7 days; before this
change a refresh token alone could never reach aal2. Mitigations that remain: reuse detection
(fires only when thief and owner both refresh), per-session revoke, sudo on destructive routes
(`bridge-guard.mjs`), and the 7-day absolute lifetime.

## What it does not cover

- A crash between the insert and the revoke leaves two live families until the old one expires.
- Other tabs holding the old refresh token get 401 `session_revoked` and sign in once.
- With session records off nothing changes: no new family, the old jti, no refresh token.
