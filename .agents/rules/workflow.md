# Workflow Rules (Osionos)

Our mode of operation for the `osionos` project is strictly as follows, overriding any conflicting rules in `CLAUDE.md`:

1. **Branching**: Always create a branch from `develop`. Never commit to `develop` or `main` directly.
2. **Quality/TDD**: We do TDD/refactoring. Ensure tests are passing (green) before and after changes.
3. **Commits**: Make atomic commits strictly following **Conventional Commits** (e.g., `feat(scope): message`, `refactor(scope): message`). *Explicitly ignore the `CLAUDE.md` rule that says to use "updated".*
4. **Changelog**: After finishing a task, document the change in `docs/CHANGELOG.md` under the `[Unreleased]` section.
5. **Pull Requests**: When finished, create a PR using the template defined in `docs/DoD.md`.
