/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageOutlineRail.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/entities/page/ui/coverMedia";
import styles from "./PageOutlineRail.module.css";

interface Heading {
  id: string;
  text: string;
  /** 1 = h1 (longest/opaque) … 3+ = short/faint. */
  level: number;
}

const HEADING_SELECTOR =
  '[data-block-type="heading_1"],[data-block-type="heading_2"],[data-block-type="heading_3"]';

// The editor's block <article> names its block in data-draggable-block-id; the
// heading it renders (and the read-only page) use data-block-id.
const blockIdOf = (el: Element): string | null =>
  el.getAttribute("data-block-id") ?? el.getAttribute("data-draggable-block-id");

const levelOf = (el: Element): number => {
  const t = el.getAttribute("data-block-type") || "";
  if (t.endsWith("_1")) return 1;
  if (t.endsWith("_2")) return 2;
  return 3;
};

/**
 * Notion-style hover TOC minimap pinned to the right edge of the reading column.
 * Reads headings straight from the rendered editor DOM (purely presentational +
 * a scroll observer), so it never duplicates the page's data-fetching.
 */
export const PageOutlineRail: React.FC<{ pageId: string }> = ({ pageId }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Collect headings from the scroll container; re-scan on DOM mutations.
  useEffect(() => {
    const scroller = rootRef.current?.closest(".osionos-page");
    // Focused editor panes wrap content in .osionos-page-body; the cheap
    // read-only split-preview pane has no such wrapper, so fall back to the
    // scroller itself — both still scope the heading scan to this one pane.
    const body = scroller?.querySelector(".osionos-page-body") ?? scroller;
    if (!scroller || !body) return;

    const scan = () => {
      // An editor block and the heading it renders both carry the block's
      // data attributes; keep the outer one (document order) so each heading
      // is listed once.
      const seen = new Set<string>();
      const next: Heading[] = [];
      body.querySelectorAll(HEADING_SELECTOR).forEach((el, i) => {
        const id = blockIdOf(el) || `h-${i}`;
        if (seen.has(id)) return;
        seen.add(id);
        next.push({ id, text: (el.textContent || "").trim() || "Untitled", level: levelOf(el) });
      });
      setHeadings(next);
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(body, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [pageId]);

  // Scroll-spy: highlight the heading currently in view.
  useEffect(() => {
    const scroller = rootRef.current?.closest(".osionos-page");
    const body = scroller?.querySelector(".osionos-page-body") ?? scroller;
    if (!scroller || !body || headings.length === 0) return;
    const els = Array.from(body.querySelectorAll(HEADING_SELECTOR));
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActiveId(blockIdOf(visible.target));
        }
      },
      { root: scroller, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings]);

  // The anchor stays mounted below two headings: the scan effect finds the
  // pane through rootRef, so returning null here meant it never ran and the
  // rail never appeared.
  const hasOutline = headings.length >= 2;

  const scrollTo = (id: string) => {
    const scroller = rootRef.current?.closest(".osionos-page");
    const target = scroller?.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    if (!target) return;
    const reduce = prefersReducedMotion();
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div
      ref={rootRef}
      data-osio-toc
      hidden={!hasOutline}
      className={styles.rail}
      data-open={open || undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className={styles.railInner}>
        {/* The collapsed minimap is the keyboard entry point: a focusable
            disclosure button. Tab lands here → the wrapper onFocus opens the
            panel → the heading buttons become reachable. The tick spans are
            decorative (the button's aria-label names the control). */}
        <button
          type="button"
          className={styles.ticks}
          aria-label="On this page"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((value) => !value)}
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

        <nav className={styles.panel} aria-label="On this page">
          <ul className={styles.list}>
            {headings.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={styles.link}
                  data-level={h.level}
                  data-active={h.id === activeId || undefined}
                  onClick={() => scrollTo(h.id)}
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
