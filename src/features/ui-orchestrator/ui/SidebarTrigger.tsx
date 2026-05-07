import React from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '@/shared/config/uiStore';

/**
 * A floating button that appears at the top-left of the content area
 * when the sidebar is closed.
 */
export const SidebarTrigger: React.FC = () => {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  if (isSidebarOpen) return null;

  return (
    <div className="absolute top-2 left-2 z-[var(--osio-z-popover)]">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className={[
          'flex items-center justify-center w-8 h-8 rounded-md',
          'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]',
          'transition-colors duration-200 cursor-pointer bg-[var(--osio-bg-surface)]',
          'border border-[var(--osio-border-default)] shadow-sm'
        ].join(' ')}
        title="Open sidebar"
      >
        <PanelLeftOpen size={18} />
      </button>
    </div>
  );
};
