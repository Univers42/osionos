/**
 * @osionos/ui — the shared component kit.
 *
 * Atoms, primitives, molecules and hooks, styled entirely through the
 * `--osio-*` custom properties declared in `tokens.css`. The kit ships no CSS
 * file of its own: a host defines the tokens (see `tokens.css` for the required
 * set) and the components inherit the host's theme, light or dark.
 *
 * Deep subpaths are supported for code-splitting — importing
 * `@osionos/ui/molecules/MermaidDiagram` does not drag the whole kit in.
 */

export * from "./atoms/ErrorBoundary";
export * from "./atoms/Button";
export * from "./atoms/IconButton";
export * from "./atoms/IconValueView";
export * from "./atoms/Card";
export * from "./atoms/Badge";
export * from "./atoms/Input";
export * from "./atoms/LoadingPane";
export * from "./atoms/SectionHeader";
export * from "./molecules/IconPicker";
export * from "./molecules/CodeSyntaxHighlight";
export * from "./molecules/EmojiPicker";
export * from "./molecules/MermaidDiagram";
export * from "./molecules/ConfirmDialog";
export * from "./molecules/SidebarNavItem";
export * from "./molecules/SidebarSection";
export * from "./hooks";
export * from "./primitives";
export * from "./shared/classNames";
export * from "./shared/iconValue";
export * from "./shared/emojiTone";
