# ADR 0005 — platform roles: the env admin is the root, roles are re-read, moderation is severity-ordered

Status: accepted 2026-10-22 (devil verdict PROCEED-WITH-CONDITIONS on the P3-4 spec, D-P3-4s).

## Decision
- **Three roles:** admin, moderator, user. They are read from grobase's `public.user_roles`, with
  an expired grant counting as no grant.
- **The env admin is the root of trust.** The identity flag that `OSIONOS_ADMIN_EMAILS` sets at
  sign-in maps to `admin` ahead of any role row. So the platform always has a way in, and no seed
  write is needed. Removing an env admin is an env change; the UI refuses it with 409
  `role_from_env`.
- **The server is the authority.**
  - Admin routes re-read the role from the database for the verified session's user, on every
    request. The claim only drives the UI.
  - A role change revokes the target's sessions. That ends the routes that still gate on the
    claim within one revocation poll (≤ 10 s, ADR 0003).
- **Moderation state is the most severe live decision** among the person-kind reports about a
  user: a ban, or a suspension that has not ended. A milder decision on another report never lifts
  it. Only re-deciding the same report does, and that write is audited.

## Rejected
- **A dedicated `osionos_user_roles` table:** grobase already has the catalogue.
- **The identity `is_admin` bit as the role:** one bit is not a role. It stays as the env
  admin's marker.
- **A claim-gated admin plane:** a demoted admin would keep power until the token expires.
- **"Newest decision wins":** a warn on an unrelated report silently lifted a ban.

## Out of scope, and what would bring it back
- **Admin user search (`?q=`).** It needs three things:
  - the admin list must read the view `osionos_people_directory`, since the directory predicate
    references `profile->>headline`, which is not on the table;
  - the select allowlist must admit `search_doc` and `headline`;
  - the keyset test fake must implement `ilike` and `wfts`.
- **A staff case-opening route:** a moderator files an ordinary report instead.
