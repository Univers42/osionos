/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplateCard.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";

import type { CatalogueCard } from "@/data/templates/catalogue/types";
import type { PageEntry } from "@/entities/page";
import { runAppAction } from "@/features/app-actions/model/runAppAction";
import { applyTargetFor } from "@/features/templates/model/applyTarget";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { canEditBody } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { TemplatePreview } from "./TemplatePreview";

type Navigate = (event: React.KeyboardEvent<HTMLDivElement>) => void;
type ApplyFromCard = (templateId: string, opener: HTMLElement | null) => void;
interface CardProps {
  card: CatalogueCard;
  focused: boolean;
  onApply: ApplyFromCard;
  onFocus: () => void;
  onNavigate: Navigate;
}
interface OptionProps extends CardProps {
  expanded: boolean;
  canApply: boolean;
  onToggle: () => void;
  onBlur: () => void;
}

/** The apply target, live: the control's disabled state follows the open page
 *  and the caller's write rights without any prop threading. */
function useApplyEnabled(): boolean {
  const active = usePageStore((state) => state.activePage);
  const page = usePageStore((state) => (active?.kind === "page" ? state.pageById(active.id) : undefined));
  const canEdit = (entry: PageEntry) => canEditBody(entry, getCurrentPageAccessContext());
  return applyTargetFor(active, page, canEdit).ok;
}

function applyTemplate(templateId: string): void {
  void runAppAction("template.apply", { templateId }, { mode: "live", trusted: true });
}

function cardKeyDown(event: React.KeyboardEvent<HTMLDivElement>, id: string, applyHere: () => void, toggle: () => void, navigate: Navigate): void {
  if (event.key === "Enter") { event.preventDefault(); toggle(); return; }
  if (event.key.toLowerCase() === "a" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (event.shiftKey) applyHere();
    else applyTemplate(id);
    return;
  }
  navigate(event);
}

// Two text-sized controls; in the ~250 px panel they sit on their own row, or the
// title truncates to nothing and the description wraps one word per line.
const CARD_ACTION = "inline-flex shrink-0 cursor-pointer items-center rounded-[var(--osio-control-radius)] px-2 py-1 text-xs font-medium text-[var(--osio-accent-text)] hover:bg-[var(--osio-bg-hover)]";

function NewPageButton({ templateId }: { templateId: string }): React.ReactElement {
  return (
    <span role="button" className={CARD_ACTION}
      onClick={(event) => { event.stopPropagation(); applyTemplate(templateId); }}>
      New page
    </span>
  );
}

/** Mouse-only, like NewPageButton: no tabindex, so the keyboard path is the
 *  card's Shift+A shortcut. Disabled carries no click action. */
function ApplyToPageButton({ disabled, onApply }: { disabled: boolean; onApply: () => void }): React.ReactElement {
  return (
    <span role="button" aria-disabled={disabled ? "true" : undefined} className={`${CARD_ACTION} aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`}
      onClick={(event) => { event.stopPropagation(); if (!disabled) onApply(); }}>
      Apply to this page
    </span>
  );
}

function CardOption({ card, focused, expanded, canApply, onApply, onToggle, onFocus, onBlur, onNavigate }: OptionProps): React.ReactElement {
  const optionRef = useRef<HTMLDivElement>(null);
  const applyHere = () => onApply(card.id, optionRef.current);
  return (
    <div ref={optionRef}
      role="option"
      aria-selected={focused || expanded}
      aria-keyshortcuts="Enter A Shift+A"
      data-template-id={card.id}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onToggle}
      onKeyDown={(event) => cardKeyDown(event, card.id, applyHere, onToggle, onNavigate)}
      className="flex cursor-pointer items-start gap-2 rounded-md px-2 pt-2 text-left outline-none hover:bg-[var(--osio-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0"><IconValueView value={card.icon} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">{card.title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--osio-fg-muted)]">{card.description}</span>
        <span className="-ml-2 mt-1 flex flex-wrap gap-1 pb-1">
          <NewPageButton templateId={card.id} />
          <ApplyToPageButton disabled={!canApply} onApply={applyHere} />
        </span>
      </span>
    </div>
  );
}

export function TemplateCard({ card, focused, onApply, onFocus, onNavigate }: CardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const canApply = useApplyEnabled();
  const toggle = () => setExpanded((value) => !value);
  const focus = () => { setActive(true); onFocus(); };
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="mb-1">
      <CardOption card={card} focused={focused} expanded={expanded} canApply={canApply} onApply={onApply} onToggle={toggle} onFocus={focus} onBlur={() => setActive(false)} onNavigate={onNavigate} />
      {hovered || active || expanded ? <TemplatePreview card={card} /> : null}
    </div>
  );
}
