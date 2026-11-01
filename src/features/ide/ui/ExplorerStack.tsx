// The Explorer's vertical stack, as in VS Code: each source is a section with a header that folds
// it and a sash that shares the height with its neighbour. Folding a section hides its tree and
// nothing else, so a file opened from it stays open. It takes data and callbacks and reads no
// store, because the same stack runs in the app and on the node's own page.
import { ChevronDown, ChevronRight } from "lucide-react";
import React from "react";

export type ExplorerStackSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  /** Muted text after the title, such as where a folder lives. */
  detail?: string;
  /** Sits at the right of the header, outside its button. Shown on hover and on focus. */
  actions?: React.ReactNode;
  collapsed: boolean;
  /** This section's share of the height it divides with the other open sections. */
  weight: number;
  children: React.ReactNode;
};

const MIN_WEIGHT = 0.1;
const KEYBOARD_STEP = 0.05;

/** Moves `delta` of the shared weight from one section to the next, keeping both usable. */
export function shareWeight(upper: number, lower: number, delta: number): [number, number] {
  const total = upper + lower;
  const next = Math.min(total - MIN_WEIGHT, Math.max(MIN_WEIGHT, upper + delta));
  return [next, total - next];
}

const StackSash: React.FC<{
  label: string;
  upper: ExplorerStackSection;
  lower: ExplorerStackSection;
  onResize(upperWeight: number, lowerWeight: number): void;
}> = ({ label, upper, lower, onResize }) => {
  const total = upper.weight + lower.weight;
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const stack = handle.parentElement;
    const startY = event.clientY;
    const startWeight = upper.weight;
    const height = stack?.getBoundingClientRect().height || 1;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientY - startY) / height) * total;
      onResize(...shareWeight(startWeight, total - startWeight, delta));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onResize(...shareWeight(upper.weight, lower.weight, event.key === "ArrowDown" ? KEYBOARD_STEP : -KEYBOARD_STEP));
  };
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((upper.weight / total) * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(total / 2, total / 2)}
      className="relative z-[var(--osio-z-raised)] -my-1 h-2 shrink-0 cursor-row-resize touch-none outline-none after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-transparent hover:after:bg-[var(--osio-accent)] focus-visible:after:bg-[var(--osio-accent)]"
    />
  );
};

const StackHeader: React.FC<{ section: ExplorerStackSection; bodyId: string; onToggle(): void }> = ({ section, bodyId, onToggle }) => {
  const Chevron = section.collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="group/section flex h-7 shrink-0 items-center gap-0.5 pr-1 hover:bg-[var(--osio-bg-hover)] focus-within:bg-[var(--osio-bg-hover)]">
      <button
        type="button"
        aria-expanded={!section.collapsed}
        aria-controls={bodyId}
        title={section.detail ? `${section.title} (${section.detail})` : section.title}
        onClick={onToggle}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-1.5 text-left text-xs font-medium text-[var(--osio-fg-default)] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--osio-accent)]"
      >
        <Chevron size={14} aria-hidden="true" className="shrink-0 opacity-70" />
        <span aria-hidden="true" className="flex shrink-0 items-center opacity-80">{section.icon}</span>
        <span className="truncate">{section.title}</span>
        {section.detail && <span className="min-w-0 truncate text-[var(--osio-fg-subtle)]">{section.detail}</span>}
      </button>
      {section.actions && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-[var(--osio-dur-fast)] group-hover/section:opacity-100 group-focus-within/section:opacity-100 [@media(hover:none)]:opacity-100">
          {section.actions}
        </div>
      )}
    </div>
  );
};

export const ExplorerStack: React.FC<{
  sections: ExplorerStackSection[];
  onToggle(id: string): void;
  onResize(upperId: string, upperWeight: number, lowerId: string, lowerWeight: number): void;
}> = ({ sections, onToggle, onResize }) => (
  <div className="flex min-h-0 flex-1 flex-col">
    {sections.map((section, index) => {
      const bodyId = `explorer-section-${section.id}`;
      const previous = sections.slice(0, index).reverse().find((candidate) => !candidate.collapsed);
      return (
        <React.Fragment key={section.id}>
          {previous && !section.collapsed && (
            <StackSash
              label={`Resize ${previous.title} and ${section.title}`}
              upper={previous}
              lower={section}
              onResize={(upperWeight, lowerWeight) => onResize(previous.id, upperWeight, section.id, lowerWeight)}
            />
          )}
          <section
            aria-label={section.title}
            data-explorer-section={section.id}
            className="flex min-h-0 flex-col border-t border-[var(--osio-border-default)] first:border-t-0"
            style={section.collapsed ? { flex: "0 0 auto" } : { flex: `${section.weight} 1 0`, minHeight: "7rem" }}
          >
            <StackHeader section={section} bodyId={bodyId} onToggle={() => onToggle(section.id)} />
            <div id={bodyId} hidden={section.collapsed} className="min-h-0 flex-1 overflow-hidden data-[open]:flex" data-open={section.collapsed ? undefined : ""}>
              {section.children}
            </div>
          </section>
        </React.Fragment>
      );
    })}
  </div>
);
