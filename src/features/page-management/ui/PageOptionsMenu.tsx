import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash } from 'lucide-react';
import { usePageStore } from '@/store/usePageStore';
import { useUserStore } from '@/features/auth';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

import styles from './PageOptionsMenu.module.scss';

interface Props {
  pageId: string;
  pageTitle: string;
  isActivePage: boolean;
  workspaceId?: string;
  onRedirectHome: () => void;
}

export const PageOptionsMenu: React.FC<Props> = ({ 
  pageId, 
  pageTitle, 
  isActivePage, 
  workspaceId: providedWorkspaceId,
  onRedirectHome 
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const jwt = useUserStore(s => s.activeJwt());
  const storeWorkspaceId = usePageStore(s => 
    Object.keys(s.pages).find(wsId => s.pages[wsId].some(p => p._id === pageId))
  );

  const workspaceId = providedWorkspaceId || storeWorkspaceId;
  const deletePage = usePageStore(s => s.deletePage);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isMenuOpen]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!workspaceId) {
      console.error('[PageOptionsMenu] Missing workspaceId for deletion', { workspaceId });
      setIsModalOpen(false);
      return;
    }

    try {
      await deletePage(pageId, workspaceId, jwt ?? '');
      if (isActivePage) {
        onRedirectHome();
      }
    } catch (err) {
      console.error('[PageOptionsMenu] Failed to delete page', err);
    } finally {
      setIsModalOpen(false);
    }
  };

  return (
    <div className="relative flex items-center" onClick={e => e.stopPropagation()} ref={menuRef}>
      <button 
        type="button" 
        className={[
          'p-1 rounded transition-colors',
          isMenuOpen ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]' : 'hover:bg-[var(--color-surface-secondary)]'
        ].join(' ')}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        title="Page options"
      >
        <MoreHorizontal size={13} />
      </button>

      {isMenuOpen && (
        <div className={styles.dropdown}>
          <button
            type="button"
            className={[styles.menuItem, styles.danger].join(' ')}
            onClick={handleDeleteClick}
          >
            <Trash size={14} className="shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {isModalOpen && (
        <ConfirmDeleteModal 
          title={pageTitle}
          onConfirm={handleConfirmDelete} 
          onCancel={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
};