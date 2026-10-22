/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ForYouStrip.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "For you" on the Home dashboard: the pages the recommender serves to the
 * user, why each of them is there, and the way to refuse one.
 *
 * The strip is OPTIONAL: when there is no slate, no item, or a recommender
 * that is off, it renders NOTHING. The dashboard is not waiting for a
 * recommendation, and there is no empty state to explain.
 *
 * A refusal removes the card at once — the user asked for it, and waiting for
 * a round trip to draw a card back would be a lie. If the refusal could not
 * be saved, the card comes back and a toast says so (C48: the server may
 * answer "not recorded", and the user is told rather than left guessing).
 *
 * NO other user is ever named: the "why" is a page of the USER's own (C55).
 */

import React, { useCallback, useEffect, useState } from "react";

import { usePageStore } from "@/store/usePageStore";
import { IconValueView, useToastStore } from "@/shared/ui";
import { fetchForYou, markNotInterested, type ForYouItem } from "../api/forYou";
import { whyText } from "../model/whyText";

/** The id of the heading the section is labelled by. */
const HEADING_ID = "osionos-for-you-heading";

/** The card: a title, two actions, and the explanation under them. */
const CARD =
  "flex w-56 flex-col gap-1 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2";

/** A quiet action under the title. */
const ACTION =
  "rounded-[var(--osio-radius-sm)] px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

/** The title of a page: the button that opens it. */
const TITLE_BUTTON =
  "flex items-center gap-1.5 rounded-[var(--osio-radius-sm)] px-1 py-0.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

/** The id of the explanation of a card. */
const whyId = (pageId: string) => `osionos-for-you-why-${pageId}`;

/**
 * The strip of the Home dashboard: what the recommender serves to this user,
 * and the way to say "not this".
 */
export const ForYouStrip: React.FC = () => {
  const openPage = usePageStore((s) => s.openPage);
  const toast = useToastStore((s) => s.push);
  const [items, setItems] = useState<ForYouItem[]>([]);
  const [slate, setSlate] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);

  // The slate is fetched ONCE, on mount: it is a snapshot of what the
  // recommender serves now, and the dashboard must not ask again on every
  // render — the recommender's budget is not the dashboard's to spend.
  useEffect(() => {
    let alive = true;
    void fetchForYou().then((result) => {
      if (!alive || !result.ok) return;
      if (!result.value.personalized) return;
      setItems(result.value.items);
      setSlate(result.value.slate ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = items.filter((item) => !hidden.includes(item.pageId));

  /** The refusal: the card goes at once, and comes back if it was not saved. */
  const onNotInterested = useCallback(
    async (item: ForYouItem) => {
      setHidden((current) => (current.includes(item.pageId) ? current : [...current, item.pageId]));
      const result = await markNotInterested(slate, item.pageId);
      if (result.ok) return;
      setHidden((current) => current.filter((id) => id !== item.pageId));
      toast({ kind: "error", title: "That could not be saved", description: result.message });
    },
    [slate, toast],
  );

  // No slate, no item: nothing is drawn, and nothing is explained.
  if (visible.length === 0) return null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="shrink-0 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-3 py-2"
    >
      <h2 id={HEADING_ID} className="mb-1.5 text-xs font-medium text-[var(--osio-fg-muted)]">
        For you
      </h2>
      <ul className="flex flex-wrap gap-2">
        {visible.map((item) => {
          const open = whyOpen === item.pageId;
          return (
            <li
              key={item.pageId}
              className={CARD}
              onKeyDown={(event) => {
                if (event.key === "Escape") setWhyOpen(null);
              }}
            >
              <button
                type="button"
                className={TITLE_BUTTON}
                onClick={() =>
                  openPage({
                    id: item.pageId,
                    workspaceId: item.workspaceId ?? "",
                    kind: "page",
                    title: item.title ?? "",
                  })
                }
              >
                <span aria-hidden="true">
                  {item.icon ? <IconValueView value={item.icon} size={16} /> : "📄"}
                </span>
                <span className="truncate">{item.title ?? "Untitled"}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={ACTION}
                  aria-expanded={open}
                  aria-controls={whyId(item.pageId)}
                  onClick={() => setWhyOpen(open ? null : item.pageId)}
                >
                  Why this?
                </button>
                <button
                  type="button"
                  className={ACTION}
                  onClick={() => {
                    void onNotInterested(item);
                  }}
                >
                  Not interested
                </button>
              </div>
              <p id={whyId(item.pageId)} hidden={!open} className="text-xs text-[var(--osio-fg-muted)]">
                {whyText(item.why)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
