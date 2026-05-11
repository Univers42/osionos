import React, { useState } from "react";
import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";

import { IconButton } from "../../atoms/IconButton";
import { cx } from "../../shared/classNames";

export interface SidebarSectionProps {
  label: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onAdd?: () => void;
  onMore?: () => void;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  label,
  children,
  defaultOpen = true,
  onAdd,
  onMore,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3">
      <div className="group relative mb-px flex h-[30px] items-center px-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="-mx-1.5 flex h-full min-w-0 flex-1 items-center gap-1 rounded-[6px] px-1.5 hover:bg-[var(--osio-bg-hover)]"
        >
          <span className="truncate text-xs font-medium leading-none text-[var(--osio-fg-subtle)]">
            {label}
          </span>
          <ChevronDown
            size={12}
            className={cx(
              "shrink-0 text-[var(--osio-fg-subtle)] opacity-0 transition-transform duration-100 group-hover:opacity-100",
              open ? "" : "-rotate-90",
            )}
          />
        </button>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onMore ? (
            <IconButton
              size="xs"
              title="Open menu"
              onClick={(event) => {
                event.stopPropagation();
                onMore();
              }}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          ) : null}
          {onAdd ? (
            <IconButton
              size="xs"
              title={`Add to ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
            >
              <Plus size={14} />
            </IconButton>
          ) : null}
        </div>
      </div>

      {open ? <div className="flex flex-col gap-px">{children}</div> : null}
    </div>
  );
};
