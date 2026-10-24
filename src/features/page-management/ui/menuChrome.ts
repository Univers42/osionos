// The sidebar's two page menus (the row's "..." menu and the right-click menu)
// share one panel and one row, so they cannot drift apart.

export const MENU_PANEL_CLASS =
  "osio-surface-overlay z-[var(--osio-z-popover)] animate-[osio-pop-in_var(--osio-dur-fast)_var(--osio-ease-emphasized)]";

// Rows are the shared menu row (recipes.css); a destructive row adds data-tone="danger".
export const MENU_ROW_CLASS = "osio-menu-item";
