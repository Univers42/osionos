/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageOutlineRail.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "@/entities/page/ui/coverMedia";
import { usePageStore } from "@/store/usePageStore";
import { VIRTUAL_BLOCK_FOCUS_EVENT } from "@/features/block-editor/model/blockDomFocus";
import { activeHeadingIndex, fillUnrenderedTops, headingsFromKey, outlineKey, type Heading } from "./outline";
import styles from "./PageOutlineRail.module.css";

// Hover intent: a pointer crossing the rail on its way elsewhere must not
// flash the panel open, and leaving it for a moment must not snap it shut.
const OPEN_DELAY_MS = 70;
const CLOSE_DELAY_MS = 220;
const FLASH_MS = 1200;
const JUMP_GAP_PX = 24;
// Frames a jump waits for the virtualizer to mount, and folds to open, its target.
const JUMP_FRAMES = 30;
const FLASH_ATTR = "data-osio-toc-flash";

const blockEl = (scroller: Element, id: string) =>
  scroller.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);

function flash(el: HTMLElement) {
  el.removeAttribute(FLASH_ATTR);
  void el.offsetWidth; // restart the animation on a repeat jump
  el.setAttribute(FLASH_ATTR, "");
  globalThis.setTimeout(() => el.removeAttribute(FLASH_ATTR), FLASH_MS);
}

/**
 * Opens the outermost still-folded block on the way to a heading, through the
 * block's own collapse button, so each kind (toggle, list item, quote) keeps
 * its own rules.
 * Caveat: matches the button by its "Expand…" label; a collapse control with
 * another label is not opened and the jump lands on the fold instead.
 */
function unfoldTowards(scroller: Element, ancestors: readonly string[]) {
  for (const id of ancestors) {
    const el = blockEl(scroller, id);
    if (!el) return;
    const fold = Array.from(el.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-label^="Expand"]'))
      .find((button) => button.closest("[data-block-id]") === el);
    if (fold) return fold.click();
  }
}

function scrollToBlock(scroller: HTMLElement, el: HTMLElement) {
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTo({ top: Math.max(0, top - JUMP_GAP_PX), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  flash(el);
}

/**
 * Notion-style "On this page" rail on the right edge of each page pane: tick
 * marks (length = heading level, bright = section being read) that expand into
 * a heading list on hover or keyboard focus. The outline is read from the page
 * store, not the DOM, so headings a virtualized page has not rendered are listed.
 */
export const PageOutlineRail: React.FC<{ pageId: string }> = ({ pageId }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = usePageStore((s) => outlineKey(s.pageById(pageId)?.content));
  const headings = useMemo(() => headingsFromKey(key), [key]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const schedule = (next: boolean, delay: number) => {
    globalThis.clearTimeout(timer.current);
    timer.current = globalThis.setTimeout(() => setOpen(next), delay);
  };
  const openNow = () => {
    globalThis.clearTimeout(timer.current);
    setOpen(true);
  };
  useEffect(() => () => globalThis.clearTimeout(timer.current), []);

  // Scroll-spy, one measurement per frame.
  useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(".osionos-page");
    if (!scroller || headings.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const paneTop = scroller.getBoundingClientRect().top;
      const tops = fillUnrenderedTops(
        headings.map((h) => {
          const el = blockEl(scroller, h.id);
          return el ? el.getBoundingClientRect().top - paneTop : Number.NaN;
        }),
      );
      if (!tops) return;
      const atBottom = scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      setActiveId(headings[activeHeadingIndex(tops, atBottom)]?.id ?? null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [headings]);

  // Keep the section being read visible inside a long, scrolling panel.
  useEffect(() => {
    const panel = panelRef.current;
    const link = panel?.querySelector<HTMLElement>("[data-active]");
    if (!open || !panel || !link) return;
    const above = link.offsetTop < panel.scrollTop;
    const below = link.offsetTop + link.offsetHeight > panel.scrollTop + panel.clientHeight;
    if (above || below) panel.scrollTop = link.offsetTop - panel.clientHeight / 2;
  }, [open, activeId]);

  const jumpTo = (heading: Heading) => {
    const scroller = rootRef.current?.closest<HTMLElement>(".osionos-page");
    if (!scroller) return;
    setActiveId(heading.id);
    let frames = 0;
    let requested = false;
    const attempt = () => {
      const target = blockEl(scroller, heading.id);
      if (target) return scrollToBlock(scroller, target);
      // Virtualized and off-render: the editor's virtualizer brings the root in.
      if (!blockEl(scroller, heading.rootId) && !requested) {
        requested = true;
        document.dispatchEvent(new CustomEvent(VIRTUAL_BLOCK_FOCUS_EVENT, {
          detail: { blockId: heading.rootId, placement: "start" },
        }));
      } else {
        unfoldTowards(scroller, heading.ancestors);
      }
      if (++frames < JUMP_FRAMES) return void requestAnimationFrame(attempt);
      const fallback = blockEl(scroller, heading.rootId);
      if (fallback) scrollToBlock(scroller, fallback);
    };
    attempt();
  };

  const links = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const focusLink = (pick: (all: HTMLButtonElement[], at: number) => number) => {
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[Math.max(0, Math.min(all.length - 1, pick(all, at)))]?.focus();
  };
  const focusActiveLink = () => {
    openNow();
    // The panel is visibility:hidden until this commit lands.
    requestAnimationFrame(() => (panelRef.current?.querySelector<HTMLElement>("[data-active]") ?? links()[0])?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inPanel = panelRef.current?.contains(document.activeElement) ?? false;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      if (inPanel) buttonRef.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!inPanel) return focusActiveLink();
      focusLink((_, at) => at + (e.key === "ArrowDown" ? 1 : -1));
    } else if ((e.key === "Home" || e.key === "End") && inPanel) {
      e.preventDefault();
      focusLink((all) => (e.key === "Home" ? 0 : all.length - 1));
    }
  };

  // The anchor always renders: the scroll-spy needs its pane before any heading exists.
  if (headings.length < 2) return <div ref={rootRef} className={styles.rail} aria-hidden="true" />;

  return (
    <div
      ref={rootRef}
      data-osio-toc
      className={styles.rail}
      data-open={open || undefined}
      onMouseEnter={() => schedule(true, OPEN_DELAY_MS)}
      onMouseLeave={() => {
        // A keyboard user reading the list keeps it while the pointer wanders.
        if (!rootRef.current?.querySelector(":focus-visible")) schedule(false, CLOSE_DELAY_MS);
      }}
      onFocus={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) openNow();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) schedule(false, 0);
      }}
      onKeyDown={onKeyDown}
    >
      <div className={styles.railInner}>
        {/* The minimap is the keyboard entry point: Tab lands here and opens
            the list, ArrowDown / Enter moves into it, Escape returns here. */}
        <button
          ref={buttonRef}
          type="button"
          className={styles.ticks}
          aria-label="On this page"
          aria-expanded={open}
          aria-controls={`osio-toc-${pageId}`}
          onClick={focusActiveLink}
        >
          {headings.map((h) => (
            <span
              key={h.id}
              className={styles.tick}
              data-level={h.level}
              data-active={h.id === activeId || undefined}
              aria-hidden="true"
            />
          ))}
        </button>

        <nav ref={panelRef} id={`osio-toc-${pageId}`} className={styles.panel} aria-label="On this page">
          <ul className={styles.list}>
            {headings.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={styles.link}
                  data-level={h.level}
                  data-active={h.id === activeId || undefined}
                  aria-current={h.id === activeId ? "location" : undefined}
                  title={h.text}
                  onClick={() => jumpTo(h)}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
};
