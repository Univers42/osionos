# Phase 0 — Inventory & Gap Map · Universal Connector + Chat Shell

> Discovery artifact per the Agent Operating Contract §3. **No production code written.**
> Status: awaiting gate acknowledgment (§9 Phase‑0 gate). Architect review: run via `Plan` subagent (the named `architect/reviewer/security/devil` agents are **not registered** in this repo — see §7).

---

## A. Target app & design intent

- **Target app:** `apps/osionos/app` (React 19 + Vite 6 + TS + Zustand 5, Tailwind v4 CSS‑first, feature‑sliced, local‑first). This is the only app with a launcher, chat surfaces, a marketplace, and `--osio-*` tokens — it is the home. *(Open decision §12.5 — recommend confirm.)*
- **Design source:** `screenshots/ai_prompt_chat.png` (Notion‑AI‑style **empty state**): centered **app identity mark** + "How can I help you today?", a large **composer** ("Do anything with AI…", `+` attach, options/sliders, **model picker = "Auto"**, mic, send up‑arrow), a **connectors strip** ("Get better answers from your apps" — Slack/Gmail/Drive/Teams/Outlook/GitHub/Jira/Linear/Box/Salesforce…), and a **"Get started"** row of suggestion cards. Dark theme.
- **Connector‑management reference:** `screenshots/market{_chose_panel,info}.png` = VS Code Extensions (list + cards + install/configure) → maps to the existing `features/marketplace` pattern.

---

## B. Component inventory (region → existing component → completeness)

| Chat‑Shell region | Best existing component (path under `apps/osionos/app/`) | Completeness |
|---|---|---|
| Launcher / rail entry | `src/widgets/activity-rail/model/railItems.ts` (+ `ui/ActivityRail.tsx`, panels) — an **Agents** rail item already exists | `ready` (add a "chat" item) |
| Tab routing | `src/widgets/workspace-grid/model/layoutTree.ts` (`TabKind` union), `model/layoutPersist.ts` (tab factories), `src/widgets/page-renderer/ui/PaneContent.tsx` (`if (tab.kind===…)` chain), `lazyViews.tsx` | `needs-wiring` (add a `chat` kind, mirror `console`) |
| Conversation surface (precedent) | `src/widgets/agent-conversation/ui/AgentConversationPage.tsx` (~578 lines) + `src/shared/agent/useAgentStream.ts` | `ready` but **does REAL inference** — see §F conflict |
| Message thread + bubble | `src/widgets/channel-messages/ui/MessageRow.tsx`; thread loop also inside AgentConversationPage | `ready` |
| Composer | `src/widgets/channel-messages/ui/composer/MessageComposer.tsx` (textarea, attach, emoji, send, ⌘↵) | `ready` (reuse; drop chat-only bits) |
| Project list / conversation list | `src/widgets/sidebar/ui/SidebarPageTree.tsx`, `widgets/channel-list`, `widgets/dm-list` (same `openTab()` pattern) | `needs-wiring` (projects→conversations tree) |
| Model picker ("Auto") | `src/shared/ui/primitives/Dropdown.tsx` (value/options/icons/keyboard) or `MiniTabs.tsx` | `needs-wiring` (drive options from connectors) |
| Modals / sheets / toasts | `src/shared/ui/primitives/{Modal,Popover,Menu,MiniTabs,Toggle,ToastViewport}.tsx` + `useToastStore.ts` | `ready` |
| Atoms (Button, IconButton, Card, Badge, Input) | `src/shared/ui/atoms/*` | `ready` |
| Connectors strip / suggestion cards | none (closest: `features/marketplace/ui/MarketplaceInfoRail.tsx` icon strip; `shared/ui/atoms/Card.tsx`) | `missing` (compose new from Card + icons) |
| Empty‑state hero (app mark + heading) | none | `missing` (compose; needs original identity mark §F) |

---

## C. Connector subsystem inventory

- **Closest analog (reuse heavily):** `src/features/marketplace/` — `model/useInstalledApps.ts` (Zustand + bridge sync to `/api/marketplace/installed`), `model/appMeta.ts` (`AppMeta`/`InstalledEntry`), `ui/MarketplaceAppRow.tsx`, `ui/MarketplaceDetailModal.tsx`. **No credential/auth fields yet** — the store+sync shape is the template for a `useConnectorStore`.
- **A connector subsystem ALREADY EXISTS (~80%) — extend, don't fork** *(architect finding)*: `src/store/settings/useConnectionsStore.ts` is a Zustand+persist store with `connect/disconnect/update/sync/byProvider`, bridge-synced to `/api/connections`, over `ConnectionRecord { provider, label, scopes, status, connectedAt, lastSyncAt, error }` (`src/store/settings/types.ts:104-117`) where `ConnectionStatus = 'connected'|'disabled'|'error'|'revoked'`. There is also a whole `src/features/connections/` feature (`ConnectButton`, `ConnectNoteModal`, `useConnections`) and a `CONNECTION_PROVIDERS` registry seed (`SettingsCenter.tsx:183-191`). ⇒ The `Connector` state machine is largely present; extend `ConnectionRecord` with `credentialRef` + a transient `connecting` state rather than building a parallel store. **Extend‑vs‑fork is a gate decision (§F.7).**
- **Server/edge broker EXISTS (resolves §6.4):** the **osionos‑bridge** Node process (`scripts/bridge-api.mjs` + `bridge-*.mjs` modules, host `:4000`, `VITE_API_URL`) reads env secrets and proxies authenticated calls — secrets never reach the browser. ⇒ **Secrets live in the bridge; the client holds only an opaque `CredentialRef` + connection state.** (Avoid the client‑side‑token anti‑pattern entirely; no `DEV‑ONLY` shortcut needed.)
- **OAuth today is server‑side:** Gmail/Calendar use a bridge proxy (`apps/mail/src/lib/mailBridge.ts` `openBridgeAuth → /auth/{provider}/start`); **no client‑side PKCE** exists. Anthropic has **no OAuth** (API‑key only). ⇒ The contract's client‑PKCE OAuth shell would be **new**, best exercised against a **mock authorization server** (§12.3).
- **IDL:** no `.proto` in the app → the `Connector` **port is a typed TS interface** (contract = types + behavioural tests).
- **Local‑first persistence template:** `src/store/usePageStore.ts` + `src/store/sync/{usePageSync,pageOutbox,pageStamp}.ts` + `src/shared/sync/outboxLedger.ts` (confirm‑only ledger, retry/backoff). Mirror for Projects/Conversations/Messages/SharedContext.
- **`validate()` target:** `GET https://api.anthropic.com/v1/models` (authenticated, non‑completion, no token cost) — performed **server‑side in the bridge** at a new `/api/connector/anthropic/validate`; UI gets `{ ok, message }` only.

---

## D. Gap map (what §5–§7 require vs. what exists)

| Contract requirement | Status | Plan |
|---|---|---|
| `Connector` port + state machine (`disconnected→connecting→connected/error`) (§6.1–6.2) | **~80% exists** | **Extend** `useConnectionsStore`/`ConnectionRecord` (add `credentialRef` + transient `connecting`); wrap behind the port. Fork only with justification (§F.7). |
| Env‑token adapter — Anthropic, real `validate()` (§6.3) | **missing (client)** / bridge has the key plumbing | New adapter calls bridge `/api/connector/anthropic/validate` (new bridge module `bridge-connector.mjs`). |
| OAuth + PKCE shell vs mock AS (§6.3) | **missing** | New OAuth adapter; mock AS for tests (config‑swappable). |
| Secure credential store + `CredentialRef` (§6.4) | **satisfiable now** | Bridge broker holds secrets; client stores `CredentialRef` + state only. |
| Inference boundary = **stub** (§6.5) | **conflict** | Repo already has real Claude inference (see §F). New Chat Shell send path → isolated `inferencePort.complete()` **stub**; do **not** import existing inference. |
| Domain model: Project/Conversation/Message/SharedContext/Connector (§5) | **missing** | New Zustand stores + outbox/ledger; mirror `usePageStore`. |
| Chat Shell UI per screenshot (§7) | **partial** | Compose from agent‑conversation/channel‑messages/primitives; build empty‑state hero, connectors strip, suggestion cards, model picker. |
| Connector management surface (connect/scopes/status/disconnect) (§7) | **largely exists** | Reuse `features/connections/` (`ConnectButton`, `ConnectNoteModal`, scopes/status) + marketplace row/modal. Add Anthropic token-entry + scope display. |
| Original app identity mark (§7) | **missing** | Design an original glyph (not any third‑party logo); per‑connector cards use providers' official assets. |
| New `tab.kind` for the surface | **missing** | Add `chat`, mirror `console`. |

---

## E. Stack & conventions to conform to (non‑negotiable)

- **State:** Zustand 5 (no new state lib). **Styling:** Tailwind v4 CSS‑first; **only `--osio-*` tokens** (single source `src/app/styles/global.css`); `scripts/check-style-tokens.sh` forbids raw colors in CSS/SCSS. **No new design system.**
- **Routing:** tab/pane tree (no react‑router); add a `tab.kind` by touching `layoutTree.ts` + `layoutPersist.ts` + `PaneContent.tsx` + `lazyViews.tsx` (+ `railItems.ts` launcher). Lazy via deep imports.
- **Conventions:** ≤200 lines / ≤5 functions per file (honor‑system; do not add violations — note AgentConversationPage already breaches it, so do **not** pattern‑match its size). Feature‑sliced; 42‑header blocks on JS/TS config files.
- **Gates:** `bash scripts/docker-run.sh quality` (graph‑engine tsc → root tsc → eslint `--max-warnings=0` → check‑style‑tokens); `test-canvas` (`tests/canvas/*.test.ts`, node `--test`, `@/` alias); `test-e2e` (`tests/e2e/functional/*.spec.mjs`, offline Vite `:3004`, helpers in `tests/browser/core/app.mjs`).
- **Hard rules:** branch from `develop`; commit msg `"updated"`, no trailer; no auto‑push; no new dependency without a §11 stop‑and‑ask.

---

## F. Critical conflicts & decisions to resolve at the gate

1. **Inference fence vs. existing reality (BLOCKER for §2/§8.8).** `scripts/bridge-agent.mjs` already calls `api.anthropic.com/v1/messages` with `x-api-key`, and `useAgentStream`/`agent-conversation` already stream real Claude. A repo‑wide "no completion API imported anywhere" grep (§8.8) **cannot pass** as written.
   - **Recommendation (refined by architect):** Enforce the fence as a **scoped import‑boundary scan**, not a repo‑wide grep (which can't pass and would miss aliased re‑exports). The scan forbids importing `useAgentStream`, `/api/agent/chat`, or any `api.anthropic.com` string under `src/features/connectors/**` and `src/widgets/chat-shell/**`, and runs as a **Phase‑1** test (the fence must exist the moment the subsystem does). The Chat Shell send path terminates at `features/chat/model/inferencePort.ts` → a labelled stub (`[stub] connector=anthropic model=… — inference not wired in Phase 1`). **`useAgentStream` is reusable only *behind* the Phase‑2 inference adapter — never imported by `chat-shell`.** Leave `agent-conversation`/`bridge-agent` untouched as the ready‑made Phase‑2 adapter. *(Confirm this satisfies the fence's intent.)*
2. **OAuth model (§12.3) — architect recommends DEMOTE.** The repo's only OAuth is **server‑side via the bridge** (`openBridgeAuth → /auth/{provider}/start`); there's no client PKCE, and **Anthropic has no OAuth** (the only must‑function connector). A client‑side PKCE flow against a mock AS would model a shape no real provider here uses, and a client‑held `code_verifier` is the same anti‑pattern as a client‑held token. **Recommendation:** Phase 1 = **env‑token only; defer the OAuth adapter.** If an OAuth port is required, model it **server‑brokered (authorization‑code via the bridge)** to match `openBridgeAuth`, not browser PKCE. **§11 dependency flag:** `pkce-challenge@5.0.1` is already in `pnpm-lock.yaml` but unused in app source — confirm intended vs stale before any OAuth work.
3. **Reuse vs. parallel build.** Do we **extend** `agent-conversation` or build a **new** `chat-shell` widget beside it? **Recommendation:** new `chat-shell` (clean separation; agent‑conversation stays "AI inside a page"), reusing its composer/thread/stream pieces.
4. **Secret model (§12.1).** Decided by the repo: **bridge broker** (server/edge) holds secrets; client gets `CredentialRef` only. No client‑side token. *(Confirm.)*
5. **Provider surface (§12.4).** Anthropic is the only connector that must **function**. Others (Slack/Gmail/Drive/GitHub/Jira/Linear/Salesforce shown in the mockup) appear as `available_to_connect` placeholders only.
6. **Subagents.** `architect/reviewer/security/devil` are not registered. **Recommendation:** substitute `Plan` (architect/reviewer) + `Explore`, and optionally install the *deal‑with‑the‑devil* kit into `.claude/` for the named agents (a dependency‑style add — your call).
7. **Extend vs. fork the existing connections subsystem (architect finding).** `useConnectionsStore`/`ConnectionRecord`/`features/connections` already do connect/scopes/status/disconnect with a status enum ~80% of the target machine. **Recommendation: extend** (add `credentialRef` + transient `connecting`, wrap behind the port) rather than build a parallel `useConnectorStore` — forking risks two provider lists + two status enums. Confirm.

> **Architect verdict: conditional GO** to Phase 1 once the §F decisions are answered. The four pre‑code plan corrections (scoped fence scan as a Phase‑1 test; reconcile §D to "extend existing"; demote OAuth to env‑token‑only + flag `pkce-challenge`; pin the inference seam so `chat-shell` hits `inferencePort` only) are now folded into this doc. Top risks: (1) transport/fence leak via `useAgentStream`; (2) duplicate connector store diverging from `useConnectionsStore`; (3) client‑PKCE built against a mock AS no real provider matches.

---

## F2. FINAL DECISIONS (Phase‑0 gate acknowledged)

1. **Inference fence** → **scope to the new subsystem.** Import‑boundary scan over `src/features/connectors/**` + the extended chat surface (Phase‑1 test). Existing `bridge-agent`/`useAgentStream` left untouched = Phase‑2 adapter.
2. **Connector store** → **build parallel new** (`src/features/connectors/model/useConnectorStore.ts`), independent of `useConnectionsStore`. *Mitigation for the divergence risk:* scope the new store to **AI‑model connectors** (Anthropic + future model providers); leave app‑data integrations (Gmail/Calendar) on `useConnectionsStore`. Document the overlap as tech‑debt.
3. **OAuth** → **full client‑side PKCE state machine against a mock AS** (contract‑literal). Implement PKCE with **Web Crypto (`crypto.subtle`)** — no new dependency (the stray `pkce-challenge@5.0.1` in the lockfile is **not** adopted). Structure so a real provider is config‑only later.
4. **Chat Shell home** → **extend `agent-conversation`** into the multi‑model Chat Shell. ⚠️ **Tension to resolve at the Phase‑3 gate:** extending the surface that already does real inference (#4) vs. the fence/stub (#1). Resolution carried to Phase 3 — the connector‑driven send path routes through `inferencePort.complete()` (stub in Phase 1), while the existing built‑in Claude path stays as the Phase‑2 adapter; exact UX of the two paths is a Phase‑3 decision. **Does not block Phase 1** (port/adapter/validate, no UI).
5. **Secret model** → bridge broker (confirmed). **Provider surface** → Anthropic only functions; others are `available_to_connect` placeholders. **Target app** → `apps/osionos/app`.

## G. Proposed file layout (conforms to feature‑sliced rules)

```
src/features/connectors/                 # the port + adapters + state (the core)
  model/connectorPort.ts                 # Connector port (typed interface) + ConnectionState machine
  model/connectorTypes.ts                # Connector, ConnectorCapability, ModelDescriptor, CredentialRef
  model/connectorRegistry.ts             # providerKey → adapter factory + static metadata
  model/useConnectorStore.ts             # Zustand state (mirror useInstalledApps)
  model/connectorSync.ts                 # persist registry/state (mirror outbox/ledger; secrets excluded)
  adapters/envTokenAdapter.ts            # generic env-token adapter
  adapters/anthropicAdapter.ts           # Anthropic (validate via bridge; static/curated listModels)
  adapters/oauthAdapter.ts               # authorization-code + PKCE state machine
  adapters/mockAuthServer.ts             # test-only mock AS (config-swappable)
  ui/ConnectorCard.tsx · ConnectorModal.tsx · ScopeList.tsx · ConnectorStatusBadge.tsx
src/features/chat/                        # domain: projects / conversations / messages / shared context
  model/{chatTypes,useProjectStore,useConversationStore,useSharedContextStore}.ts
  model/inferencePort.ts                 # complete() — Phase-1 STUB only (no provider import)
src/widgets/chat-shell/                   # the surface (composed from existing components)
  ui/ChatShell.tsx (mounts via tab.kind="chat") · EmptyStateHero.tsx · ChatThread.tsx
  ui/ChatComposer.tsx (reuse MessageComposer) · ModelPicker.tsx · ConnectorsStrip.tsx · SuggestionCards.tsx
scripts/bridge-connector.mjs              # bridge module: /api/connector/anthropic/validate + OAuth callback (mock)
docs/connector-chat/                      # this doc + later design notes
```
Touch points to add the surface: `layoutTree.ts` (`TabKind |= "chat"`), `layoutPersist.ts` (`chatTab()`), `PaneContent.tsx` (dispatch), `lazyViews.tsx` (`LazyChatShell`), `railItems.ts` (launcher). Mirror the `console` kind.

---

## H. Phase plan & gates (maps to §9; subagents substituted)

- **Phase 0 (this doc)** → gate: `Plan` architect review of this gap map + **your ack on §F decisions**. ⛔ no code until ack.
- **Phase 1** — `connectorPort` over the **extended** `useConnectionsStore` + env‑token Anthropic adapter + real `validate()` (bridge `/api/connector/anthropic/validate`); unit/contract tests (faked transport) **+ the scoped import‑boundary fence test**. Gate: tests green + `Plan` reviewer.
- **Phase 2** — secret model confirmation (bridge broker) + disconnect + security string‑scan (no secret in props/state/localStorage/logs/URLs). **OAuth deferred** unless §F.2 says otherwise (and then server‑brokered, not client PKCE). Gate: `Plan` security + reviewer.
- **Phase 3** — Chat Shell assembly (empty‑state hero, thread, composer, model picker wired to connectors, connectors strip, projects/conversations/shared‑context CRUD) + **inference stub** at the boundary. Gate: reviewer + e2e happy path.
- **Phase 4** — original identity mark, empty/loading/error states, a11y, responsive (ui‑ux‑pro‑max). Gate: design parity + full §8 acceptance suite.

One focused commit/PR per unit, each with tests. No phase‑spanning commits.
