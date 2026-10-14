// The sidebar's two page menus (the row's "..." menu and the right-click menu)
// share one panel and one row, so they cannot drift apart.

export const MENU_PANEL_CLASS =
  "osio-surface-overlay z-[var(--osio-z-popover)] animate-[osio-pop-in_var(--osio-dur-fast)_var(--osio-ease-emphasized)]";

const MENU_ROW_BASE =
  "flex h-[var(--osio-control-h-sm)] w-full items-center gap-2 rounded-[var(--osio-radius-sm)] px-2 text-left text-sm transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)]";

export const MENU_ROW_CLASS = `${MENU_ROW_BASE} text-[var(--osio-fg-default)]`;

export const MENU_ROW_DESTRUCTIVE_CLASS = `${MENU_ROW_BASE} text-[var(--osio-danger)] hover:text-[var(--osio-danger-hover)]`;
