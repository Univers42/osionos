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
 * the first visible one.
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
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const debugTools = usePageDebugStore((state) => state.enabled);

  const openAppearance = () => { setQuery(''); setAppearanceOpen(true); };
  const context: PageMenuContext = {
    actions,
    pageSurface,
    canToggleWiki,
    toggleWiki,
    canDashboard,
    onImport,
    onMoveTo,
    onUseAI,
    onOpenAppearance: openAppearance,
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
      <div className="px-2 pb-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2">
          <Search size={14} className="text-[var(--osio-fg-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setAppearanceOpen(false); }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              firstVisible?.run();
            }}
            placeholder="Search actions..."
            aria-label="Search actions"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
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
            {index > 0 && <div className="osio-menu-separator" />}
            {section.label && <div className="osio-menu-label">{section.label}</div>}
            {section.submenu ? (
              <MenuSubmenu
                label={section.submenu.label}
                icon={section.submenu.icon}
                testId={section.submenu.testId}
                open={appearanceOpen}
                onOpenChange={setAppearanceOpen}
              >
                <AppearanceSubmenu items={section.submenu.items} />
              </MenuSubmenu>
            ) : section.id === 'more' ? (
              <MoreGroup
                items={section.items}
                translateLocale={actions.translateLocale}
                onTranslateLocale={actions.setTranslateLocale}
                onApplyTranslate={() => runPageAction(actions.translate(actions.translateLocale), onError)}
              />
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

      <footer className="border-t border-[var(--osio-border-default)] px-2 py-2 text-xs text-[var(--osio-fg-subtle)]">
        <p>Last edited {actions.editedAgo}</p>
        <p>Word count: {actions.wordCount} words</p>
      </footer>
    </div>
  );
};
