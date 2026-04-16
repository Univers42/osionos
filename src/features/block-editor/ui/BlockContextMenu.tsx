import React, { createRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type {
  BlockContextMenuSection,
  BlockContextMenuState,
} from "../model/blockContextMenu.helpers";

interface BlockContextMenuProps {
  menu: BlockContextMenuState | null;
  sections: BlockContextMenuSection[];
  onClose: () => void;
  width?: number;
}

function clampMenuPosition(y: number, x: number, width: number) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxHeight = Math.min(520, viewportHeight - 24);
  const left = Math.max(12, Math.min(x, viewportWidth - width - 12));
  const top = Math.max(12, Math.min(y, viewportHeight - maxHeight - 12));
  return { top, left, maxHeight };
}

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  menu,
  sections,
  onClose,
  width = 260,
}) => {
  const ref = useMemo(() => createRef<HTMLDivElement>(), []);
  const active = Boolean(menu);

  useEffect(() => {
    if (!active) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onClose, ref]);

  const position = useMemo(() => {
    if (!menu) return null;
    return clampMenuPosition(menu.y, menu.x, width);
  }, [menu, width]);

  if (!menu || !position || sections.length === 0) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 border-0 bg-transparent p-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close block context menu"
        style={{ zIndex: 10000 }}
      />
      <div
        ref={ref}
        className="fixed overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] py-1 shadow-xl"
        style={{
          top: position.top,
          left: position.left,
          width,
          maxHeight: position.maxHeight,
          zIndex: 10001,
        }}
      >
        {sections.map((section, index) => (
          <div key={`${section.label ?? "section"}-${index}`}>
            {section.label ? (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                {section.label}
              </p>
            ) : null}
            {section.items.map((item) => (
              <button
                key={`${section.label ?? "section"}-${item.label}`}
                type="button"
                onClick={item.onClick}
                className={(() => {
                  if (item.danger) {
                    return "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors text-red-600 hover:bg-red-50";
                  }

                  if (item.active) {
                    return "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors bg-[var(--color-surface-hover)] text-[var(--color-ink)]";
                  }

                  return "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]";
                })()}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)]">
                  {item.icon}
                </span>
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
            {index < sections.length - 1 ? (
              <div className="my-1 border-t border-[var(--color-line)]" />
            ) : null}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
};
