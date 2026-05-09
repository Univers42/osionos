import React, { useCallback, useMemo, useRef } from "react";

export interface MiniTabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface MiniTabsProps<T extends string> {
  value: T;
  options: MiniTabItem<T>[];
  onChange: (next: T) => void;
  size?: "sm" | "md";
}

function nextEnabledIndex<T extends string>(options: MiniTabItem<T>[], from: number, direction: 1 | -1) {
  if (options.length === 0) return -1;
  for (let step = 1; step <= options.length; step++) {
    const index = (from + direction * step + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function MiniTabs<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: Readonly<MiniTabsProps<T>>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  );
  const buttonClass = size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm";

  const focusAndSelect = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      refs.current[index]?.focus();
    },
    [onChange, options],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusAndSelect(nextEnabledIndex(options, activeIndex, 1));
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusAndSelect(nextEnabledIndex(options, activeIndex, -1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusAndSelect(options.findIndex((option) => !option.disabled));
      }
      if (event.key === "End") {
        event.preventDefault();
        for (let index = options.length - 1; index >= 0; index--) {
          if (!options[index].disabled) {
            focusAndSelect(index);
            break;
          }
        }
      }
    },
    [activeIndex, focusAndSelect, options],
  );

  return (
    <div
      role="tablist"
      tabIndex={0}
      className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--osio-bg-subtle)] p-1"
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            className={[
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              buttonClass,
              selected
                ? "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-sm"
                : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
            ].join(" ")}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span className="text-[var(--osio-fg-subtle)]">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
