import React from "react";

import { cx } from "../../shared/classNames";

export interface SidebarNavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  indent?: number;
  subtle?: boolean;
  onClick: () => void;
  rightElement?: React.ReactNode;
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  icon,
  label,
  count,
  active = false,
  indent = 0,
  subtle = false,
  onClick,
  rightElement,
}) => {
  const paddingLeft = 10 + indent * 12;
  const stateClass = active
    ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
    : subtle
      ? "text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)]"
      : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]";

  const countBadge = count !== undefined && count > 0 ? (
    <span className="flex h-4 min-w-[16px] items-center justify-center rounded bg-[var(--osio-danger)] px-[3px] text-xs font-semibold text-[var(--osio-danger-fg)]">
      {count}
    </span>
  ) : null;

  return (
    <div
      className={cx(
        "group relative flex w-full select-none items-center gap-2 rounded-[6px] text-base font-medium",
        stateClass,
      )}
      style={{ paddingLeft, paddingRight: 8, height: 30, minHeight: 27 }}
    >
      <button
        type="button"
        onClick={onClick}
        className={cx(
          "flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 rounded-[6px] text-base font-medium transition-colors duration-100",
          stateClass,
        )}
        style={{ paddingLeft: 0, paddingRight: 0, height: 30, minHeight: 27 }}
      >
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center opacity-70">
          {icon}
        </span>
        <span className="flex-1 truncate text-left">{label}</span>
        {countBadge}
      </button>

      {rightElement ? (
        <div className="absolute right-0 flex h-full items-center">
          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {rightElement}
          </div>
        </div>
      ) : null}
    </div>
  );
};
