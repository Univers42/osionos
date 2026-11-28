import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { moveTargetIndex, readTabSlots, slotEdge } from '@/widgets/workspace-grid/model/tabDropHint';

const SAMPLE_TABS = ['Notes', 'Plan', 'Ideas', 'Tasks'];
const STEP_MS = 520;

interface DragStage {
  order: string[];
  source: number | null;
  gap: number | null;
  settling: string | null;
}

const RESTING = (order: string[]): DragStage => ({ order, source: null, gap: null, settling: null });

/**
 * A four-tab strip that drags its second tab to the end when Play is pressed, wearing the same
 * attributes as a real tab strip (TabStrip) so motion.css animates both the same way: Slide parts
 * the tabs and folds the carried one, Line marks the drop with a bar.
 */
export const TabDragPreview: React.FC = () => {
  const list = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stage, setStage] = useState<DragStage>(() => RESTING(SAMPLE_TABS));
  const [gapPx, setGapPx] = useState(0);
  const [edge, setEdge] = useState(0);
  const [snap, setSnap] = useState(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  useLayoutEffect(() => {
    if (list.current && stage.gap !== null) setEdge(slotEdge(readTabSlots(list.current), stage.gap));
  }, [stage.gap, stage.source]);

  const snapTwoFrames = () => {
    setSnap(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)));
  };

  const play = () => {
    clearTimers();
    const order = stage.order;
    const from = 1;
    const carried = order[from];
    setGapPx(list.current?.querySelectorAll<HTMLElement>('[data-drop-item]')[from]?.offsetWidth ?? 0);
    snapTwoFrames();
    setStage({ order, source: from, gap: from, settling: null });
    const stops = [from + 1, order.length - 1, order.length];
    stops.forEach((gap, step) => {
      timers.current.push(setTimeout(() => setStage((s) => ({ ...s, gap })), STEP_MS * (step + 1)));
    });
    timers.current.push(
      setTimeout(() => {
        const next = order.filter((name) => name !== carried);
        next.splice(moveTargetIndex(from, order.length), 0, carried);
        snapTwoFrames();
        setStage({ ...RESTING(next), settling: carried });
      }, STEP_MS * (stops.length + 1)),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={play}
        aria-label="Play the tab dragging sample"
        className="min-h-[var(--osio-control-h-md)] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-xs font-medium text-[var(--osio-fg-default)] hover:border-[var(--osio-border-strong)]"
      >
        Play
      </button>
      <div
        ref={list}
        aria-hidden="true"
        data-tab-drag-sample=""
        data-drop-list=""
        data-drop-snap={snap ? '' : undefined}
        style={{ '--osio-drag-gap': `${gapPx}px` } as React.CSSProperties}
        className="relative flex h-9 max-w-full items-stretch overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1"
      >
        {stage.order.map((name, index) => (
          <span
            key={name}
            data-drop-item=""
            data-drag-source={index === stage.source ? '' : undefined}
            data-drop-shift={stage.gap !== null && index >= stage.gap && index !== stage.source ? '' : undefined}
            data-settling={name === stage.settling ? '' : undefined}
            onAnimationEnd={name === stage.settling ? () => setStage((s) => ({ ...s, settling: null })) : undefined}
            className="osio-tab my-1 flex h-7 max-w-[200px] shrink-0 items-center rounded-[var(--osio-radius-chip)] px-3 text-xs text-[var(--osio-fg-muted)] data-[settling]:bg-[var(--osio-bg-hover)] data-[settling]:text-[var(--osio-fg-default)]"
          >
            {name}
          </span>
        ))}
        {stage.gap === null ? null : <span className="osio-tab-slot" style={{ transform: `translateX(${edge}px)` }} />}
      </div>
    </div>
  );
};
