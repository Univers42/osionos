import React, { useState, useMemo } from 'react';
import { Search, X, FileText, ChevronRight, Hash } from 'lucide-react';
import { usePageStore } from '@/store/usePageStore';
import { useUserStore } from '@/features/auth';
import { isValidMove } from '@/store/pageStore.helpers';

import styles from './MovePageModal.module.scss';

interface Props {
  sourcePageId: string;
  onClose: () => void;
}

export const MovePageModal: React.FC<Props> = ({ sourcePageId, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const pages = usePageStore((s) => s.pages);
  const movePage = usePageStore((s) => s.movePage);
  
  const workspaces = useUserStore((s) => {
    const session = s.activeSession();
    return session 
      ? [...session.privateWorkspaces, ...session.sharedWorkspaces] 
      : [];
  });

  const allPages = useMemo(() => Object.values(pages).flat(), [pages]);

  const handleMove = (targetParentId: string | null, targetWorkspaceId: string) => {
    movePage(sourcePageId, targetParentId, targetWorkspaceId);
    onClose();
  };

  const filteredPages = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return allPages.filter((p) => {
      if (p._id === sourcePageId) return false;
      if (!isValidMove(pages, sourcePageId, p._id)) return false;
      return p.title.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [allPages, searchTerm, sourcePageId, pages]);

  const renderPageTree = (workspaceId: string, parentId: string | null = null, depth = 0) => {
    const wsPages = pages[workspaceId] ?? [];
    const children = wsPages.filter((p) => p.parentPageId === parentId);

    return children.map((page) => {
      // Hide source page and its descendants
      if (page._id === sourcePageId || !isValidMove(pages, sourcePageId, page._id)) {
        return null;
      }

      const hasChildren = wsPages.some((p) => p.parentPageId === page._id);

      return (
        <React.Fragment key={page._id}>
          <button
            type="button"
            className={`${styles.listItem} ${depth > 0 ? styles.nested : ''}`}
            style={{ paddingLeft: `${(depth + 1) * 1.5}rem` }}
            onClick={() => handleMove(page._id, workspaceId)}
          >
            <span className={styles.itemIcon}>
              {page.icon ? <span>{page.icon}</span> : <FileText size={14} />}
            </span>
            <span className={styles.itemTitle}>{page.title || 'Untitled'}</span>
            {hasChildren && <ChevronRight size={12} className="text-[var(--color-ink-faint)]" />}
          </button>
          {renderPageTree(workspaceId, page._id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header / Search */}
        <div className={styles.header}>
          <Search size={16} className={styles.searchIcon} />
          <input
            autoFocus
            className={styles.searchInput}
            placeholder="Search for a page to move to..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <X size={16} />
          </button>
        </div>

        {/* List Area */}
        <div className={styles.scrollArea}>
          {searchTerm.trim() ? (
            <>
              <div className={styles.sectionLabel}>Search Results</div>
              {filteredPages.length > 0 ? (
                filteredPages.map((page) => (
                  <button
                    key={page._id}
                    type="button"
                    className={styles.listItem}
                    onClick={() => handleMove(page._id, page.workspaceId)}
                  >
                    <span className={styles.itemIcon}>
                      {page.icon ? <span>{page.icon}</span> : <FileText size={14} />}
                    </span>
                    <div className="flex flex-col overflow-hidden">
                      <span className={styles.itemTitle}>{page.title || 'Untitled'}</span>
                      <span className="text-[10px] text-[var(--color-ink-faint)] truncate">
                        {workspaces.find(w => w._id === page.workspaceId)?.name ?? 'Workspace'}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className={styles.emptyState}>No pages found matching &quot;{searchTerm}&quot;</div>
              )}
            </>
          ) : (
            workspaces.map((ws) => (
              <div key={ws._id} className="mb-4">
                <div className={styles.sectionLabel}>{ws.name}</div>
                
                {/* Move to Root Option */}
                <button
                  type="button"
                  className={styles.listItem}
                  onClick={() => handleMove(null, ws._id)}
                >
                  <span className={styles.itemIcon}>
                    <Hash size={14} className="text-[var(--color-ink-faint)]" />
                  </span>
                  <span className={styles.itemTitle}>Move to {ws.name} Root</span>
                </button>

                {/* Recursive Tree */}
                {renderPageTree(ws._id)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
