import React from "react";
import { Bot, Home, Inbox, Search, type LucideIcon } from "lucide-react";

import type { PhoneTabId } from "../model/phoneStack";

const TABS: readonly { id: PhoneTabId; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "search", label: "Search", Icon: Search },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "agent", label: "Agent", Icon: Bot },
];

/** The bottom navigation: four tabs, each at least 44px, the active one marked `aria-current`. */
export const PhoneTabBar: React.FC<{ active: PhoneTabId; onSelect: (tab: PhoneTabId) => void }> = ({ active, onSelect }) => (
  <nav
    aria-label="Primary"
    data-testid="phone-tabbar"
    className="phone-tabbar flex shrink-0 border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-page)]"
  >
    {TABS.map(({ id, label, Icon }) => (
      <button
        key={id}
        type="button"
        aria-current={id === active ? "page" : undefined}
        onClick={() => onSelect(id)}
        className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-[var(--osio-fg-muted)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--osio-accent)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      >
        <Icon size={20} aria-hidden />
        <span>{label}</span>
      </button>
    ))}
  </nav>
);
