import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  placeholder?: string;
  align?: "start" | "end";
  width?: number | "trigger" | "auto";
}

const VIEWPORT_PAD = 8;
const DEFAULT_MENU_WIDTH = 260;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function enabledOptionIndex<T extends string>(options: DropdownOption<T>[], start: number, direction: 1 | -1) {
  if (options.length === 0) return -1;
  for (let step = 1; step <= options.length; step++) {
    const index = (start + step * direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select",
  align = "start",
  width = "trigger",
}: Readonly<DropdownProps<T>>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const typeAheadRef = useRef("");
  const typeAheadTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const listboxId = useMemo(() => `dropdown-${crypto.randomUUID()}`, []);
  const selectedOption = options[selectedIndex];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = globalThis.innerWidth;
    const viewportHeight = globalThis.innerHeight;
    let resolvedWidth = DEFAULT_MENU_WIDTH;
    if (width === "trigger") {
      resolvedWidth = rect.width;
    } else if (typeof width === "number") {
      resolvedWidth = width;
    }
    const maxHeight = Math.min(360, viewportHeight - VIEWPORT_PAD * 2);
    const belowTop = rect.bottom + 6;
    const aboveTop = rect.top - maxHeight - 6;
    const top = belowTop + maxHeight > viewportHeight - VIEWPORT_PAD && aboveTop > VIEWPORT_PAD
      ? aboveTop
      : clamp(belowTop, VIEWPORT_PAD, viewportHeight - maxHeight - VIEWPORT_PAD);
    const preferredLeft = align === "end" ? rect.right - resolvedWidth : rect.left;
    setMenuStyle({
      position: "fixed",
      top,
      left: clamp(preferredLeft, VIEWPORT_PAD, viewportWidth - resolvedWidth - VIEWPORT_PAD),
      width: width === "auto" ? undefined : resolvedWidth,
      minWidth: width === "auto" ? rect.width : undefined,
      maxHeight,
      opacity: 1,
      zIndex: 10003,
    });
  }, [align, width]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const closeMenu = useCallback(() => setOpen(false), []);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu();
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [closeMenu, onChange, options],
  );

  const focusByFirstLetter = useCallback(
    (letter: string) => {
      typeAheadRef.current += letter.toLowerCase();
      if (typeAheadTimerRef.current) globalThis.clearTimeout(typeAheadTimerRef.current);
      typeAheadTimerRef.current = globalThis.setTimeout(() => { typeAheadRef.current = ""; }, 700);
      const needle = typeAheadRef.current;
      const index = options.findIndex(
        (option) => !option.disabled && option.label.toLowerCase().startsWith(needle),
      );
      if (index >= 0) setActiveIndex(index);
    },
    [options],
  );

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      updatePosition();
      optionRefs.current[activeIndex]?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleResize = () => updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("scroll", handleScroll, true);
    globalThis.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("scroll", handleScroll, true);
      globalThis.removeEventListener("resize", handleResize);
    };
  }, [activeIndex, closeMenu, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
    },
    [openMenu],
  );

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => enabledOptionIndex(options, index, 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => enabledOptionIndex(options, index, -1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(options.findIndex((option) => !option.disabled));
      } else if (event.key === "End") {
        event.preventDefault();
        for (let index = options.length - 1; index >= 0; index--) {
          if (!options[index].disabled) {
            setActiveIndex(index);
            break;
          }
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(activeIndex);
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        focusByFirstLetter(event.key);
      }
    },
    [activeIndex, choose, closeMenu, focusByFirstLetter, options],
  );

  return (
    <>
      <button // NOSONAR - ARIA combobox is required for the custom portaled dropdown menu.
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className="inline-flex min-h-8 items-center justify-between gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-default)] transition hover:bg-[var(--osio-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div // NOSONAR - ARIA listbox is required for the custom portaled dropdown menu.
          ref={menuRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          className="overflow-y-auto rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-xl outline-none"
          style={menuStyle}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-[var(--osio-fg-default)] outline-none hover:bg-[var(--osio-bg-hover)] focus:bg-[var(--osio-bg-hover)] disabled:cursor-not-allowed disabled:text-[var(--osio-fg-subtle)] disabled:hover:bg-transparent"
              onClick={() => choose(index)}
            >
              {option.icon ? <span className="mt-0.5 shrink-0 text-[var(--osio-fg-muted)]">{option.icon}</span> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{option.label}</span>
                {option.description ? <span className="mt-0.5 block text-xs text-[var(--osio-fg-muted)]">{option.description}</span> : null}
              </span>
              {option.value === value ? <Check size={14} className="mt-0.5 shrink-0 text-[var(--osio-accent)]" /> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
