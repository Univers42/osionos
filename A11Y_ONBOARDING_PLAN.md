# 🌟 Onboarding & Context: Universal WCAG 2.2 AA & Multi-Agent Workflow in Osionos

> **Context Source:** Ported directly from `prismatica` after establishing an automated 0-violation WCAG 2.2 Level AA audit pipeline, strict Devil & Quality Magistrate governance, and atomic commit discipline under `DJSurgeon`.

---

## 🎯 Mission & Objectives

1. **Establish Repository-Wide WCAG 2.2 AA & 3.0 Draft Compliance:**
   - Audit and remediate all interactive workspaces, block editor (`EditableContent.tsx`), floating selection toolbars, slash menus, dialogs, and kanban/canvas components in Osionos.
2. **Autonomous Multi-Agent Workflow Execution:**
   - Operate under the **Devil & Quality Magistrate** governance ([`.antigravity/instructions.md`](.antigravity/instructions.md) & [`GEMINI.md`](GEMINI.md)).
   - Enforce atomic micro-commits signed by `DJSurgeon <djsurgeon83@gmail.com>` with `-s`.
   - Never edit application code directly from the orchestrator; delegate via [`TASK_SPEC.md`](TASK_SPEC.md) to Docker workers or containerized runs.
   - Deliver 5-minute review Pull Requests targeting `develop`, adhering to [`docs/DoD.md`](docs/DoD.md) and updating [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

---

## 🏗️ Osionos Architecture & Non-Negotiable Guardrails

### 1. Docker-First Execution (NEVER run Node directly on host)
- In Osionos, root `node_modules/` is an empty container mount point.
- **Always run commands via Docker:**
  - `npm run test:quality`: Primary gate (tsc passes, eslint `--max-warnings=0`, markdown-engine limits, token contracts).
  - `npm run typecheck`: TypeScript compilation across root and packages (`packages/graph-engine`, `packages/markdown-engine`).
  - `npm run lint` / `npm run lint:fix`: ESLint with zero-warning tolerance.
  - `npm run test:e2e`: Playwright suite running against offline Vite server on `:3004`.
  - `npm run test:e2e:smoke`: Fast verification smoke suite.
  - `npm run tokens`: Regenerate and validate token contracts in `scripts/tokens/`.

### 2. Feature-Sliced Hierarchy (`src/`)
- Downward-only dependencies:
  `app → pages → widgets → features → entities → shared`
- Reusable engines reside in `packages/`:
  - `packages/graph-engine`
  - `packages/markdown-engine`

### 3. Git Branching & Commits
- Base branch: **`develop`** (per `.agents/rules/workflow.md`). Never branch or merge directly to `main`.
- Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`.
- Author & Sign-off:
  ```bash
  git commit -s --author="DJSurgeon <djsurgeon83@gmail.com>" -m "<type>(<scope>): <description>"
  ```

---

## ♿ WCAG 2.2 AA Critical Points for Osionos Workspace

See [`.agents/skills/accesibilidad-wcag/SKILL.md`](.agents/skills/accesibilidad-wcag/SKILL.md):

1. **SC 2.5.8 (Target Size - Minimum):**
   - Minimum **24x24 px** on desktop, **44x44 px** on touch viewports for all block drag handles, icon action buttons, slash command menu items, and sidebar toggles.
2. **SC 2.4.11 & 2.4.12 (Focus Not Obscured):**
   - Active focused blocks or toolbar controls must never be hidden behind sticky topbars, floating selection bubbles, or side docks.
   - Enforce visible focus rings (`:focus-visible`).
3. **SC 2.5.7 (Dragging Movements):**
   - Notion-style drag-and-drop block reordering and canvas panning **must** have keyboard alternatives (e.g. keyboard shortcuts `Alt+ArrowUp` / `Alt+ArrowDown`, move actions in block menu).
4. **SC 1.4.3 & 1.4.11 (Color Contrast & Token Discipline):**
   - Normal text ≥ 4.5:1 ratio, large text / UI controls ≥ 3:1 ratio.
   - Rely strictly on tokens in `scripts/tokens/`; zero hardcoded arbitrary hex values.
5. **Radix UI & Semantic HTML:**
   - Use Radix UI primitives (`@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`) with proper keyboard traps, `Escape` key handlers, and ARIA announcements.
   - For `EditableContent.tsx`: correct roles and focus management.

---

## 📋 Step-by-Step Implementation Roadmap for the New Session

### Step 1: Initialize Working Branch
```bash
git checkout -b feat/a11y-audit-and-rules origin/develop
```

### Step 2: Track Ported Rules & Skills
Stage and commit the newly ported configuration files:
```bash
git add .antigravity/ .agents/ AGENTS.md GEMINI.md A11Y_ONBOARDING_PLAN.md .gemini/plan/
git commit -s --author="DJSurgeon <djsurgeon83@gmail.com>" -m "chore(workflow): setup devil magistrate instructions and wcag 2.2 a11y skills"
```

### Step 3: Run Baseline Quality Gate
Ensure the baseline environment in Docker is completely green:
```bash
npm run test:quality
npm run test:e2e:smoke
```

### Step 4: Scaffold Automated A11y Suite in Playwright
- Create `tests/e2e/visual/a11y.spec.mjs` targeting the offline test server (`:3004`).
- Inject `axe-core` to inspect:
  1. Empty document / canvas view.
  2. Block editor with various block types (headings, code, lists, callouts).
  3. Slash command menu active state.
  4. Settings / modal dialogs.

### Step 5: TDD Remediation Loop
- For each axe violation discovered:
  1. Write / isolate failing test case.
  2. Fix component / styles adhering to token contracts.
  3. Verify with `npm run test:quality` and `npm run test:e2e`.
  4. Micro-commit with `DJSurgeon`.

### Step 6: PR Delivery (5-Minute Review)
- Update `docs/CHANGELOG.md` under `[Unreleased]`.
- Complete checklist in `docs/DoD.md`.
- Open PR towards `develop` with Before/After visual evidence and audit results table.

---

## 🧰 Key Files Quick Reference
- [`.antigravity/instructions.md`](.antigravity/instructions.md) — Devil magistrate orchestrator protocol
- [`.agents/skills/accesibilidad-wcag/SKILL.md`](.agents/skills/accesibilidad-wcag/SKILL.md) — WCAG 2.2 AA / 3.0 draft guidelines
- [`GEMINI.md`](GEMINI.md) — Core project rules (Risk, Library-first, Quality bar, Prompt contract)
- [`AGENTS.md`](AGENTS.md) — Terse smart caveman communication style
- [`.agents/rules/workflow.md`](.agents/rules/workflow.md) — Osionos workflow rules (develop branch, TDD, Conventional Commits)
- [`docs/DoD.md`](docs/DoD.md) — Definition of Done checklist
