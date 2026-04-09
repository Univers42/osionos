# Phase 1: The Guardian of Types and Routes (Strict Configuration)

Before touching the code, we harden the environment so that the compiler detects circular import errors or weak types.

- **TypeScript 5.7 Configuration:** In `tsconfig.json`, enable `strict: true` and `noImplicitAny: true`. This ensures that contracts between layers are unbreakable.
- **Path Alias Mapping:** Configure `@/*` to point to `src/` in both `tsconfig.json` and `vite.config.ts`. This eliminates the `../../../../` that break readability in FSD.
- **Create Directory Structure:** Run `mkdir -p src/{app,pages,widgets,features,entities,shared}`.
- **Install SASS:** Run `pnpm add -D sass-embedded` to support SCSS Modules, which is the Prismatica standard for avoiding style collisions.

# Phase 2: Atomic Style Architecture (Tokens)

Migrate `index.css` to a token‑based SCSS system to eliminate hardcoded (magic) values.

- **Extract Tokens:** Create `src/app/styles/base/tokens/`.
  - `_colors.scss`: Move color variables from `index.css` and `notionPage.css`.
  - `_spacing.scss`: Define the 4px/8px scale for margins and paddings.
  - `_typography.scss`: Define font families and sizes.
- **Entry Point:** Create `src/app/styles/_graphical-chart.scss` that `@forward`s all tokens. This file will be the single source of truth for design.
- **Clean Global CSS:** `index.css` becomes `src/app/styles/global.scss`, containing only CSS reset and base font styles.

# Phase 3: `shared/` Layer (Universal Tools)

Here we move code that has no Notion business logic and could be used in any other project.

- **API Client:** Move `api/client.ts` to `src/shared/api/client.ts`. Ensure it uses environment variables for the base URL.
- **Markdown Engine (MarkEngine):** The sub‑module `lib/markengine/` is purely technical. Move it to `src/shared/lib/markengine/`. This includes `shortcuts.ts` and the block parsers.
- **UI Atoms Components:**
  - `components/ErrorBoundary.tsx` → `src/shared/ui/ErrorBoundary/`.
  - Identify pure components in `components/page/` such as `EmojiPicker.tsx` and move them to `src/shared/ui/molecules/EmojiPicker/`.
- **Configuration:** Move `lib/theme.ts` to `src/shared/config/theme.ts`.

# Phase 4: Entity Models (Data Contracts)

Define *what* a Block, a Page, and a User are. In this phase we only move types and pure validators.

- **Block Entity:** Move `types/database.ts` to `src/entities/block/model/types.ts`. Include `hooks/blockTypeGuards.ts` here.
- **Page Entity:** Move `store/pageStore.types.ts` to `src/entities/page/model/types.ts`.
- **User Entity:** Move `store/userStore.types.ts` to `src/entities/user/model/types.ts`.
- **Public API:** Create an `index.ts` in each entity folder (e.g., `src/entities/block/index.ts`) that exports only the necessary types. **Rule:** No one outside the folder can import directly from internal files.

# Phase 5: Entity UI (Data Presentation)

Move components that know how to display data from an entity but do not allow editing or manage complex state.

- **Read‑Only Blocks:** Move `components/ReadOnlyBlock.tsx`, `CalloutBlockReadOnly.tsx`, and `CodeBlockReadOnly.tsx` to `src/entities/block/ui/`.
- **Page Elements:** Move `components/page/PageIcon.tsx`, `PageTitle.tsx`, `PageCover.tsx`, and `PageProperties.tsx` to `src/entities/page/ui/`.
- **Reasoning:** These components are "Dumb Components". They receive entity data as props and render them using SCSS Modules.

# Phase 6: Features (Interaction Logic)

This is where Zustand state and hooks that allow the user to interact with the system reside.

- **Auth Feature:** Move `store/useUserStore.ts` and `userStore.helpers.ts` to `src/features/auth/model/`. The components `UserSwitcherPanel.tsx` and `WorkspaceSwitcher.tsx` go to `src/features/auth/ui/`.
- **Block Editor Feature:** Move `components/BlockEditor.tsx`, `TodoBlockEditor.tsx`, and `ToggleBlockEditor.tsx` to `src/features/block-editor/ui/`. Their main logic, `hooks/usePlaygroundBlockEditor.ts`, goes to `src/features/block-editor/model/`.
- **Slash Commands Feature:** Move `components/blocks/SlashCommandMenu.tsx` and `hooks/useSlashSelect.ts` to `src/features/slash-commands/`.
- **Golden Rule:** A feature never imports from another feature.

# Phase 7: Widgets (Assembly Organisms)

Large pieces that combine entities and features to create sections of the interface.

- **Sidebar Widget:** Move the remaining logic from `components/sidebar/` (such as `NotionSidebar.tsx` and `SidebarPageTree.tsx`) to `src/widgets/sidebar/ui/`. This widget orchestrates the auth feature and the page entity.
- **Page Renderer Widget:** Move `components/PageBlocksRenderer.tsx` and `components/MainContent.tsx` to `src/widgets/page-renderer/ui/`. It is responsible for rendering the list of blocks of a page.
- **Database View Widget:** Move `components/DatabaseBlock.tsx` to `src/widgets/database-view/ui/`.

# Phase 8: Final Orchestration (`pages/` and `app/`)

The highest level of composition where routes and global providers are assembled.

- **Pages:** Move `components/page/NotionPage.tsx` to `src/pages/notion-page/ui/NotionPage.tsx`. This file must now be very thin, limited to mounting the widgets from Phase 7 in a layout.
- **App Providers:** Create `src/app/providers/` and move there the initialisation logic of Zustand stores and the `ThemeProvider` based on `lib/theme.ts`.
- **Entry Point:** Move `main.tsx` and `App.tsx` to `src/app/`. `App.tsx` will only contain the Router and the Providers.