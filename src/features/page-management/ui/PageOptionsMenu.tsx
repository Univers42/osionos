import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash } from 'lucide-react';
import { usePageStore } from '@/store/usePageStore';
import { useUserStore } from '@/features/auth';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  pageId:       string;
  pageTitle:    string;
  isActivePage: boolean;
  onRedirectHome: () => void;
}

/**
 * Dropdown menu for page-level actions (Delete, etc.).
 * Triggered by the "..." button in the Sidebar tree items.
 */
export const PageOptionsMenu: React.FC<Props> = ({ 
  pageId, 
  pageTitle, 
  isActivePage, 
  onRedirectHome 
}) => {
  const [isMenuOpen, setIsMenuOpen]   = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Directly access store data to avoid prop-drilling
  const jwt = useUserStore(s => s.activeJwt());
  
  // Find the workspaceId that contains this page by searching the store
  const workspaceId = usePageStore(s => 
    Object.keys(s.pages).find(wsId => s.pages[wsId].some(p => p._id === pageId))
  );

  const deletePage = usePageStore(s => s.deletePage);

  // Close menu when clicking outside
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
      {/* Trigger Button */}
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

      {/* Floating Dropdown Menu */}
      {isMenuOpen && (
        <div 
          className="absolute right-0 top-full mt-1 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-xl z-[110] py-1 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <button
            type="button"
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-[var(--color-text-danger)] hover:bg-[var(--color-surface-hover)] text-left transition-colors"
            onClick={handleDeleteClick}
          >
            <Trash size={14} className="shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
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
