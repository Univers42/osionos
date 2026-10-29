import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

export interface MenuSubmenuProps {
  label: string;
  icon: React.ReactNode;
  /** Right-aligned hint shown on the row before the chevron. */
  hint?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  testId?: string;
}

const GAP = 2;
const VIEWPORT_MARGIN = 8;

function firstFocusable(panel: HTMLElement | null): HTMLElement | null {
  return panel?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])') ?? null;
}

/**
 * A menu row that opens a side panel: hover or ArrowRight/Enter opens it,
 * Escape/ArrowLeft returns to the row. The panel is portalled to the body (a
 * scrolling menu would clip it) and fixed next to the row: it flips left when
 * that would leave the viewport — and a nested panel keeps its parent's side so
 * it never lands on the menu — and slides up when it is taller than the room.
 */
export const MenuSubmenu: React.FC<MenuSubmenuProps> = ({ label, icon, hint, open, onOpenChange, children, testId }) => {
  const rowRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) globalThis.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = globalThis.setTimeout(() => onOpenChange(false), 150);
  };
  useEffect(() => cancelClose, []);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !rowRef.current) return;
    const row = rowRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const parentFlipped = rowRef.current.closest('[data-submenu-side="left"]') !== null;
    const flip = parentFlipped || row.right + GAP + panel.width > globalThis.innerWidth - VIEWPORT_MARGIN;
    panelRef.current.dataset.submenuSide = flip ? 'left' : 'right';
    const left = flip ? row.left - panel.width - GAP : row.right + GAP;
    const top = Math.max(VIEWPORT_MARGIN, Math.min(row.top, globalThis.innerHeight - panel.height - VIEWPORT_MARGIN));
    panelRef.current.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`;
    panelRef.current.style.top = `${top}px`;
  }, [open]);

  // Escape and ArrowLeft close the submenu without closing the whole menu, even
  // when the pointer opened it and focus never entered the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      const inPanel = panelRef.current?.contains(target) ?? false;
      // A deeper submenu (its panel is another portal) closes first; this level
      // closes on the next press, once focus is back in its own panel.
      if (!inPanel && target?.closest?.('[data-page-menu-layer]')) return;
      if (event.key === 'Escape' || (event.key === 'ArrowLeft' && inPanel)) {
        event.stopPropagation();
        onOpenChange(false);
        rowRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onOpenChange, open]);

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      data-page-menu-layer=""
      data-testid={testId ? `${testId}-panel` : undefined}
      onMouseEnter={cancelClose}
      onMouseLeave={closeSoon}
      className="osio-surface-overlay fixed z-[var(--osio-z-popover)] max-h-[70vh] w-[220px] overflow-y-auto p-1"
      style={{ left: 0, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative" onMouseEnter={() => { cancelClose(); onOpenChange(true); }} onMouseLeave={closeSoon}>
      <button
        ref={rowRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => onOpenChange(true)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown' && event.key !== 'Enter') return;
          event.preventDefault();
          onOpenChange(true);
          globalThis.requestAnimationFrame(() => firstFocusable(panelRef.current)?.focus());
        }}
        className="osio-menu-item"
        style={{ height: 'var(--osio-control-h-md)' }}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint && <span className="max-w-24 truncate text-xs text-[var(--osio-fg-subtle)]">{hint}</span>}
        <ChevronRight size={14} className="shrink-0 text-[var(--osio-fg-subtle)]" />
      </button>
      {panel}
    </div>
  );
};
