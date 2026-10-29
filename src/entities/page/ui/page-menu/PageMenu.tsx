import React, { useState } from 'react';
import { Search } from 'lucide-react';

import { MenuSubmenu } from '@/shared/ui';
import { runPageAction } from '@/entities/page/model/runPageAction';
import { usePageDebugStore } from '@/shared/debug/pageDebugStore';
import type { ReturnTypeOfUsePageActions } from './actionTypes';
import { AppearanceSubmenu } from './AppearanceSubmenu';
import { AnalyticsPanel, VersionsPanel } from './DetailPanels';
import { MoreGroup } from './MoreGroup';
import { PageMenuRow } from './PageMenuRow';
import { buildPageMenuSections, type PageMenuContext } from './buildPageMenuSections';
import type { PageMenuItem } from './types';

export interface PageMenuProps {
  actions: ReturnTypeOfUsePageActions;
  pageSurface: string | undefined;
  canToggleWiki: boolean;
  toggleWiki: () => void;
  canDashboard: boolean;
  onImport: () => void;
  onMoveTo: () => void;
  onUseAI: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}

function searchResults(sections: ReturnType<typeof buildPageMenuSections>, query: string): PageMenuItem[] {
  const found: PageMenuItem[] = [];
  for (const section of sections) {
    if (section.submenu) {
      found.push(...section.submenu.items.filter((item) => item.label.toLowerCase().includes(query)));
      const row = section.items[0];
      if (row && section.submenu.label.toLowerCase().includes(query)) found.push(row);
      continue;
    }
    found.push(...section.items.filter((item) => item.label.toLowerCase().includes(query)));
  }
  const seen = new Set<string>();
  return found.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * The page "…" menu: a searchable, Notion-grouped panel. Search filters rows
 * one by one (submenu rows included, promoted to the top level) and Enter runs
 * the first visible one. Appearance, More and Developer tools each sit behind a
 * side panel, one open at a time, so the menu fits without scrolling.
 */
export const PageMenu: React.FC<PageMenuProps> = ({
  actions,
  pageSurface,
  canToggleWiki,
  toggleWiki,
  canDashboard,
  onImport,
  onMoveTo,
  onUseAI,
  onError,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const debugTools = usePageDebugStore((state) => state.enabled);

  const openSubmenuFromSearch = (id: string) => { setQuery(''); setOpenSubmenu(id); };
  const submenuToggle = (id: string) => (open: boolean) =>
    setOpenSubmenu((current) => (open ? id : current === id ? null : current));
  const context: PageMenuContext = {
    actions,
    pageSurface,
    canToggleWiki,
    toggleWiki,
    canDashboard,
    onImport,
    onMoveTo,
    onUseAI,
    onOpenSubmenu: openSubmenuFromSearch,
    onError,
    onClose,
    debugTools,
  };
  const sections = buildPageMenuSections(context);
  const normalized = query.trim().toLowerCase();
  const results = normalized ? searchResults(sections, normalized) : [];
  const firstVisible = normalized ? results[0] : sections[0]?.items[0];

  return (
    <div
      data-testid="page-config-menu"
      className="osio-surface-overlay absolute right-0 top-full z-[var(--osio-z-popover)] mt-2 flex max-h-[80vh] w-[260px] flex-col overflow-hidden"
    >
      <div className="relative px-2 pb-1">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--osio-fg-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpenSubmenu(null); }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            firstVisible?.run();
          }}
          placeholder="Search actions..."
          aria-label="Search actions"
          className="h-8 w-full rounded-[var(--osio-radius-sm)] bg-[var(--osio-bg-subtle)] pl-7 pr-2 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {normalized ? (
          <div className="py-1">
            {results.length > 0
              ? results.map((item) => <PageMenuRow key={`search-${item.id}`} item={item} />)
              : <p className="px-2 py-6 text-center text-sm text-[var(--osio-fg-muted)]">No matching action</p>}
          </div>
        ) : sections.map((section, index) => (
          <React.Fragment key={section.id}>
            {index > 0 && !section.continues && <div className="osio-menu-separator" />}
            {section.label && <div className="osio-menu-label">{section.label}</div>}
            {section.submenu ? (
              <MenuSubmenu
                label={section.submenu.label}
                icon={section.submenu.icon}
                hint={section.submenu.hint}
                testId={section.submenu.testId}
                open={openSubmenu === section.id}
                onOpenChange={submenuToggle(section.id)}
              >
                {section.id === 'appearance' && <AppearanceSubmenu items={section.submenu.items} />}
                {section.id === 'more' && (
                  <MoreGroup
                    items={section.submenu.items}
                    translateLocale={actions.translateLocale}
                    onTranslate={(locale) => {
                      actions.setTranslateLocale(locale);
                      runPageAction(actions.translate(locale), onError);
                    }}
                  />
                )}
                {section.id === 'tools' && section.submenu.items.map((item) => <PageMenuRow key={item.id} item={item} />)}
              </MenuSubmenu>
            ) : section.items.map((item) => <PageMenuRow key={item.id} item={item} />)}
          </React.Fragment>
        ))}

        {actions.detailPanel === 'analytics' && <AnalyticsPanel config={actions.config} />}
        {actions.detailPanel === 'versions' && (
          <VersionsPanel
            versions={actions.versions}
            onRestore={(version) => runPageAction(actions.restoreVersion(version), onError)}
            onSave={() => runPageAction(actions.saveVersion(), onError)}
          />
        )}
      </div>

      <footer className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--osio-border-default)] px-3 pt-2 text-xs text-[var(--osio-fg-subtle)]">
        <span className="truncate">Edited {actions.editedAgo}</span>
        <span className="shrink-0 tabular-nums">{actions.wordCount} words</span>
      </footer>
    </div>
  );
};
